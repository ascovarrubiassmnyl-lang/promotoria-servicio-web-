# CRM de seguros — estructura de clientes, pólizas, automatizaciones y comisiones

Thu, 13 Aug 26

### Segmentación de Clientes y Prospectos

- Separar la tabla actual en dos segmentos distintos: prospectos y clientes
  - Hoy todo está mezclado: Fabiola (propuesta), Marcela (seguimiento hasta febrero), Ricardo Tapia, Juan José Castillo
- Agregar opción de “cliente frío”: prospecto sin datos de contacto aún
  - Solución actual (correo falso tipo aaa@gmail.com) es ineficiente
- Fuente del cliente: convertir en lista desplegable igual que el pipeline
  - Opciones: referido, Facebook, Instagram, anuncios, prospección en frío, etc.
- Botón “necesita seguimiento”: mantener, pero moverlo a los tres puntos de la ficha, no en el registro inicial

### Ficha Técnica del Cliente

- Eliminar el bloque de “Detalle de interés”: duplica la sección de notas
- Botón “Editar” duplicado: quitar el botón visible, dejarlo solo en los tres puntos
- Bloque de contacto: renombrar botón de editar a “Agregar datos del cliente”
  - Permite añadir RFC, CURP, dirección y más info que no se captura al registrar
- Archivos del cliente: al dar clic en un documento, debe previsualizarse, no descargarse automáticamente
  - Opción de descarga disponible pero secundaria; también permitir eliminar archivos
- Notas generales: reemplazar por sistema de recordatorios segmentado
  - Recordatorios para el asesor (llamadas, seguimientos)
  - Recordatorios para el cliente (pagos, renovaciones, automatizaciones futuras)

### Módulo de Pólizas

- Prioridad inmediata: cargar catálogo completo de productos al CRM
- Al seleccionar producto, el nombre debe autorrellenarse y bloquearse (no editable manualmente)
- Prima anual: permitir cambio entre pesos, dólares y UDIS con conversión automática
- Fin de vigencia: calcular automáticamente según producto seleccionado
  - Permitir ajuste manual sin tener que navegar mes a mes en el calendario
- Próximo pago: notificación un día antes y el mismo día del vencimiento
  - Agregar campo: póliza domiciliada (sí/no) para omitir recordatorios de cobro si es automático
  - Agregar método de pago: tarjeta de crédito (MSI) o débito
- Coberturas: agregar costo individual por cobertura (gratuitas vs. con costo extra)
- Registrar pago: mostrar pantalla de confirmación con monto y periodo antes de aceptar
  - Opción “otro monto” con campo para justificación (opcional)
- Nueva funcionalidad clave: subir PDF de póliza emitida y extraer datos automáticamente con IA
  - Generar ficha completa + conservar documento original en el sistema
- Agregar campo: fecha de emisión de la póliza (distinta a fecha de firma)
- Historial de pagos: semáforo visual por cliente (pagó / pendiente / cancelado)

### Automatizaciones y Recordatorios

- Objetivo: que el CRM sea la “mano derecha del asesor”
  - Recordatorio de prospectos sin avance tras 15 días
  - Notificaciones de meta mensual (“llevas 6 de 10 pólizas”)
  - Retargeting automatizado a prospectos sin respuesta
- Notificaciones push al celular y computadora, no solo visibles en el dashboard
  - Modelo: WhatsApp, Uber Eats, Google Maps
- MVP de automatizaciones: sección tipo n8n o ManyChat dentro del CRM
  - Definir qué automatizar en iteraciones futuras
- Backup del sistema: necesario ante pérdida de datos; restaurar a última versión reciente

### Clínica Telefónica, Calendario y Metas

- Clínica telefónica: poblar automáticamente con prospectos etiquetados como “necesita llamada para cita”
  - Eliminar la carga manual prospecto por prospecto
  - Contador de llamadas y citas obtenidas por sesión
- Calendario: alinear vista semanal visualmente con la vista mensual
- Meta de pólizas: 5 pólizas al mes (a definir con la promotora)
- Tasa de cierre: medirla por actividad completa del embudo, no solo por dinero ingresado
  - Prospectos abordados → llamadas → citas agendadas → citas asistidas → propuestas → firmas → pagos

### Próximos Pasos

- **Cargar catálogo completo de productos al CRM**
- **Definir meta mensual de pólizas con la promotora**
- **Pasar requerimientos de pólizas y automatizaciones a Claude**

---