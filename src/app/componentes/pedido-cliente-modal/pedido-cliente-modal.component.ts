import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { Estado, Pedido } from '../../clases/pedido';
import { DataService } from '../../services/data.service';
import { Router } from '@angular/router';
import {
  IonButton,
  IonFooter,
  IonButtons,
  IonContent,
  IonList,
  IonItem,
  IonToolbar,
  IonThumbnail,
  IonLabel,
  IonTitle,
  IonIcon,
} from '@ionic/angular/standalone';
import {
  trashOutline,
  checkmarkCircleOutline,
  closeCircleOutline,
} from 'ionicons/icons';
import { addIcons } from 'ionicons';
import { Usuario } from 'src/app/clases/usuario';
import { UsuarioService } from 'src/app/services/usuario.service';
import { ToastService } from 'src/app/services/toast.service';
import { Observable } from 'rxjs';
import { Producto } from 'src/app/clases/producto';
import { Cliente } from 'src/app/clases/cliente';
import { LoadingService } from 'src/app/services/loading.service';
import { LoadingComponent } from 'src/app/componentes/loading/loading.component';

@Component({
  selector: 'app-pedido-cliente-modal',
  templateUrl: './pedido-cliente-modal.component.html',
  styleUrls: ['./pedido-cliente-modal.component.scss'],
  standalone: true,
  imports: [
    IonIcon,
    IonTitle,
    IonLabel,
    IonFooter,
    IonButton,
    CommonModule,
    IonButtons,
    IonContent,
    IonList,
    IonItem,
    IonToolbar,
    IonThumbnail,
    LoadingComponent,
  ],
})
export class PedidoClienteModalComponent implements OnInit {
  @Input() productos: Producto[] = []; // Recibimos los productos desde el componente padre
  productosAgrupados: {
    id: string;
    nombre: string;
    precio: number;
    cantidad: number;
    fotos: string[];
    tiempoEstimado: number;
    tipo: string;
    estado: string;
  }[] = [];
  total: number = 0;
  @Input() usuarioId: string | any;
  @Output() productosActualizados = new EventEmitter<any[]>();
  @Output() totalActualizado = new EventEmitter<number>();
  usuario: Usuario | null = null;
  @Input() estadoPedido: string = 'default';
  @Input() pedidoRecibido: Pedido | any;

  //Variables para mostrar el detalle del pago del cliente
  propina: number = 0;
  montoIngresado: number = 0;
  propinaPorcentaje: number = 0;

  constructor(
    private modalController: ModalController,
    private dataService: DataService,
    private router: Router,
    private usuarioService: UsuarioService,
    private toastService: ToastService,
    public loadindSrv: LoadingService
  ) {
    addIcons({ trashOutline, checkmarkCircleOutline, closeCircleOutline });
  }

  ngOnInit() {
    this.agruparProductos();
    if (this.usuarioId) {
      this.usuarioService.getUser(this.usuarioId).subscribe((userData) => {
        this.usuario = userData; // Cambia el tipo de `usuario` a `Usuario | null`.
      });
    }
    this.calcularTotal();

    console.log(this.pedidoRecibido);
  }

  agruparProductos() {
    const mapa = new Map();

    this.productos.forEach((producto) => {
      if (mapa.has(producto.id)) {
        mapa.get(producto.id).cantidad++;
      } else {
        mapa.set(producto.id, {
          ...producto,
          cantidad: 1,
          tiempoEstimado: producto.tiempoPreparacion,
        });
      }
    });
    this.productosAgrupados = Array.from(mapa.values());
  }

  calcularTotal() {
    this.total = this.productosAgrupados.reduce(
      (total, producto) => total + producto.precio * producto.cantidad,
      0
    );

    if (
      this.pedidoRecibido != undefined &&
      this.pedidoRecibido.estado == 'pagado'
    ) {
      this.total = this.pedidoRecibido.precioTotal;
      this.propina = this.pedidoRecibido.propina;
      this.montoIngresado = this.pedidoRecibido.pagado;
      this.propinaPorcentaje = (this.propina / this.total) * 100;
    }
  }
  eliminarProducto(index: number) {
    const producto = this.productosAgrupados[index];
    if (producto.cantidad > 1) {
      producto.cantidad--;
    } else {
      this.productosAgrupados.splice(index, 1);
    }
    this.actualizarTotal();
    this.productosActualizados.emit(this.productosAgrupados);
    this.totalActualizado.emit(this.total);
  }

  actualizarTotal() {
    this.total = this.productosAgrupados.reduce(
      (acc, producto) => acc + producto.precio * producto.cantidad,
      0
    );
  }
  close() {
    this.modalController.dismiss({
      productos: this.productosAgrupados,
      total: this.total,
    });
  }

  async realizarPedido() {
    if (this.usuario?.mesaAsignada) {
      let cliente = <Cliente>this.usuario;

      const nuevoPedido = new Pedido();
      nuevoPedido.clienteId = this.usuarioId;
      nuevoPedido.productos = this.productosAgrupados.map((producto) => ({
        id: producto.id,
        nombre: producto.nombre,
        precio: producto.precio,
        cantidad: producto.cantidad,
        tipo: producto.tipo,
        fotos: producto.fotos,
        tiempoEstimado: producto.tiempoEstimado,
        estado: Estado.enPreparacion,
      }));
      nuevoPedido.precioTotal = this.total;
      (nuevoPedido.nroMesa = this.usuario.mesaAsignada), //
        (nuevoPedido.estado = Estado.pendiente);
      nuevoPedido.calcularTiempoEstimado();
      try {
        this.loadindSrv.showLoading();
        // Guardar el pedido y obtener el ID
        const pedidoId = await this.dataService.saveObject(
          nuevoPedido.toJSON(),
          'pedidos'
        );

        if (!pedidoId) {
          throw new Error('No se pudo obtener el ID del pedido');
        }

        nuevoPedido.id = pedidoId;

        // Actualizar el cliente con el pedido
        await this.usuarioService.updateUserField(
          cliente.id,
          'pedido',
          nuevoPedido.toJSON()
        );
        this.loadindSrv.hideLoading();
        this.toastService.showExito('Pedido realizado');

        this.modalController.dismiss(nuevoPedido);
        
        if (this.usuario?.id && this.usuario.perfil === 'cliente anonimo'){
          this.router.navigate(['/home', this.usuarioId]);
        }
        else {
          this.router.navigate(['/home']);
        }
      } catch (error) {
        this.loadindSrv.hideLoading();
        this.toastService.showError('Error al guardar el pedido: ' + error);
      }
    } else {
      this.toastService.showError('Ha ocurrido un error al realizar el pedido');
    }
  }

  confirmarRechazarPedido(estado: string) {
    this.modalController.dismiss(estado);
  }
}
