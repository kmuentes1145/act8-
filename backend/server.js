// backend/server.js
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 5000;
const saltRounds = 10;

const db = mysql.createConnection({
    host: process.env.MYSQLHOST || 'localhost',
    user: process.env.MYSQLUSER || 'root',
    password: process.env.MYSQLPASSWORD || '',
    port: process.env.MYSQLPORT || 3306,
    database: process.env.MYSQLDATABASE || 'inventario_db'
});

db.connect(err => {
    if (err) {
        console.error('❌ Error al conectar a MySQL:', err);
        return;
    }
    console.log('✅ Conectado a MySQL');
});

// Crear tablas
db.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        rol ENUM('admin', 'usuario') DEFAULT 'usuario',
        fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`);

db.query(`
    CREATE TABLE IF NOT EXISTS productos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        descripcion TEXT,
        categoria VARCHAR(50),
        precio DECIMAL(10,2) NOT NULL,
        stock INT NOT NULL DEFAULT 0,
        codigo VARCHAR(50) UNIQUE
    )
`);

db.query(`
    CREATE TABLE IF NOT EXISTS movimientos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        producto_id INT NOT NULL,
        tipo ENUM('entrada', 'salida') NOT NULL,
        cantidad INT NOT NULL,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE
    )
`, () => {
    console.log('✅ Tablas listas');
});

app.use(cors({ origin: '*' }));
app.use(bodyParser.json());

// === RUTAS ===
app.get('/', (req, res) => {
    res.send('Backend de Inventario funcionando 🚀');
});

// === RUTAS PRODUCTOS ===
app.get('/productos', (req, res) => {
    db.query("SELECT * FROM productos", (err, results) => {
        if (err) return res.status(500).json({ msg: err.message });
        res.json(results);
    });
});

app.get('/productos/:id', (req, res) => {
    const { id } = req.params;
    db.query("SELECT * FROM productos WHERE id = ?", [id], (err, results) => {
        if (err) return res.status(500).json({ msg: err.message });
        if (results.length === 0) return res.status(404).json({ msg: 'Producto no encontrado' });
        res.json(results[0]);
    });
});

app.post('/productos', (req, res) => {
    const { nombre, descripcion, categoria, precio, stock, codigo } = req.body;
    const sql = `INSERT INTO productos (nombre, descripcion, categoria, precio, stock, codigo) VALUES (?, ?, ?, ?, ?, ?)`;
    db.query(sql, [nombre, descripcion, categoria, precio, stock, codigo], (err, result) => {
        if (err) return res.status(500).json({ msg: err.message });
        res.status(201).json({ id: result.insertId, ...req.body });
    });
});

app.put('/productos/:id', (req, res) => {
    const { id } = req.params;
    const { nombre, descripcion, categoria, precio, stock, codigo } = req.body;
    const sql = `UPDATE productos SET nombre=?, descripcion=?, categoria=?, precio=?, stock=?, codigo=? WHERE id=?`;
    db.query(sql, [nombre, descripcion, categoria, precio, stock, codigo, id], (err) => {
        if (err) return res.status(500).json({ msg: err.message });
        res.json({ msg: 'Producto actualizado' });
    });
});

app.delete('/productos/:id', (req, res) => {
    const sql = "DELETE FROM productos WHERE id = ?";
    db.query(sql, [req.params.id], (err) => {
        if (err) return res.status(500).json({ msg: err.message });
        res.json({ msg: 'Producto eliminado' });
    });
});

// === AUTENTICACIÓN ===
app.post('/auth/register', async (req, res) => {
    const { nombre, email, password } = req.body;
    if (!nombre || !email || !password) {
        return res.status(400).json({ msg: 'Todos los campos son obligatorios' });
    }

    try {
        db.query("SELECT * FROM usuarios WHERE email = ?", [email], async (err, results) => {
            if (err) return res.status(500).json({ msg: 'Error en el servidor' });
            if (results.length > 0) return res.status(400).json({ msg: 'El correo ya está registrado' });

            const hashedPassword = await bcrypt.hash(password, saltRounds);
            db.query("INSERT INTO usuarios (nombre, email, password) VALUES (?, ?, ?)", [nombre, email, hashedPassword], (err) => {
                if (err) return res.status(500).json({ msg: 'Error al registrar' });
                res.status(201).json({ msg: 'Usuario registrado' });
            });
        });
    } catch (error) {
        res.status(500).json({ msg: 'Error interno' });
    }
});

app.post('/auth/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ msg: 'Email y contraseña son obligatorios' });

    db.query("SELECT id, nombre, email, rol, password FROM usuarios WHERE email = ?", [email], async (err, results) => {
        if (err) return res.status(500).json({ msg: 'Error en el servidor' });
        if (results.length === 0) return res.status(400).json({ msg: 'Credenciales inválidas' });

        const usuario = results[0];
        const valid = await bcrypt.compare(password, usuario.password);
        if (!valid) return res.status(400).json({ msg: 'Credenciales inválidas' });

        res.json({
            msg: 'Inicio de sesión exitoso',
            usuario: {
                id: usuario.id,
                nombre: usuario.nombre,
                email: usuario.email,
                rol: usuario.rol
            }
        });
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Backend corriendo en puerto ${PORT}`);
});