const express = require('express');
const socket = require('socket.io');
const mongoose = require('mongoose');
const app = express();

// Conectar a MongoDB
mongoose.connect('mongodb://localhost/chatDB', { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Conectado a la base de datos MongoDB'))
    .catch(err => console.log('Error de conexión a MongoDB:', err));

// Esquema del usuario
const UsuarioSchema = new mongoose.Schema({
    usuario: { type: String, unique: true },
    contraseña: String
});

const Usuario = mongoose.model('Usuario', UsuarioSchema);

// Esquema del mensaje
const MensajeSchema = new mongoose.Schema({
    usuario: String,
    mensaje: String,
    fecha: { type: Date, default: Date.now }
});

const Mensaje = mongoose.model('Mensaje', MensajeSchema);

// Servidor Express
const server = app.listen(5000, '0.0.0.0', function() {
    console.log("Servidor escuchando en puerto 5000...");
});

// Servir archivos estáticos
app.use(express.static('public'));

// Inicializar socket.io
const io = socket(server);
let usuariosEnLinea = [];

// Conexión de socket
io.on('connection', function(socket) {
    console.log('Nueva conexión: ' + socket.id);

    // Cargar mensajes existentes desde MongoDB
    Mensaje.find().sort('fecha').then(mensajes => {
        socket.emit('cargarMensajes', mensajes); // Enviar los mensajes al cliente
    }).catch(err => {
        console.log('Error al cargar los mensajes:', err);
    });

    // Recibir un nuevo mensaje
    socket.on('chat', function(data) {
        const nuevoMensaje = new Mensaje({
            usuario: data.usuario,
            mensaje: data.mensaje
        });

        nuevoMensaje.save().then(() => {
            io.sockets.emit('chat', data); // Emitir el mensaje a todos
        }).catch(err => {
            console.log('Error al guardar el mensaje:', err); // Manejar errores al guardar
        });
    });

    // Registrar nuevo usuario
    socket.on('registrarUsuario', function(data) {
        const nuevoUsuario = new Usuario({
            usuario: data.usuario,
            contraseña: data.contraseña
        });

        nuevoUsuario.save().then(() => {
            socket.emit('respuestaValidacion', { validado: true, usuario: data.usuario });
        }).catch(err => {
            console.log('Error al registrar el usuario:', err);
            socket.emit('respuestaValidacion', { validado: false });
        });
    });

    // Validar usuario al iniciar sesión
    socket.on('validarUsuario', function(data) {
        Usuario.findOne({ usuario: data.usuario, contraseña: data.contraseña })
            .then(usuario => {
                if (usuario) {
                    socket.emit('respuestaValidacion', { validado: true, usuario: usuario.usuario });
                } else {
                    socket.emit('respuestaValidacion', { validado: false });
                }
            })
            .catch(err => {
                console.log('Error al validar usuario:', err);
                socket.emit('respuestaValidacion', { validado: false });
            });
    });

    // Añadir nuevo usuario en línea
    socket.on('nuevoUsuario', function(nombreUsuario) {
        if (!usuariosEnLinea.includes(nombreUsuario)) {
            usuariosEnLinea.push(nombreUsuario);
            io.sockets.emit('usuariosEnLinea', usuariosEnLinea); // Emitir lista de usuarios en línea
        }
        socket.username = nombreUsuario;
    });

    // Mostrar que un usuario está escribiendo
    socket.on('typing', function(data) {
        socket.broadcast.emit('typing', data);
    });

    // Desconexión de usuario
    socket.on('disconnect', function() {
        if (socket.username) {
            usuariosEnLinea = usuariosEnLinea.filter(usuario => usuario !== socket.username);
            io.sockets.emit('usuariosEnLinea', usuariosEnLinea); // Actualizar lista de usuarios en línea
        }
        console.log('Usuario desconectado: ' + socket.id);
    });
});
