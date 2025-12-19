const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = 5000;
const saltRounds = 10;

// Primero, conectarse SIN especificar base de datos
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: ''
});

// Crear base de datos si no existe
db.query("CREATE DATABASE IF NOT EXISTS inventario_db", (err) => {
    if (err) {
        console.error('❌ Error al crear la base de datos:', err);
        process.exit(1);
    }
    console.log('✅ Base de datos "inventario_db" lista');

    // Ahora cambia a esa base de datos
    db.changeUser({ database: 'inventario_db' }, (err) => {
        if (err) {
            console.error('❌ Error al usar la base de datos:', err);
            process.exit(1);
        }

        // Crear tabla de usuarios
        db.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                rol ENUM('admin', 'usuario') DEFAULT 'usuario',
                fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) {
                console.error('❌ Error al crear tabla "usuarios":', err);
                return;
            }
            console.log('✅ Tabla "usuarios" lista');
        });

        // Crear tabla de productos
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
        `, (err) => {
            if (err) {
                console.error('❌ Error al crear tabla "productos":', err);
                return;
            }
            console.log('✅ Tabla "productos" lista');
        });

        // Crear tabla de movimientos
     // Crear tabla de movimientos
db.query(`
    CREATE TABLE IF NOT EXISTS movimientos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        producto_id INT NOT NULL,
        tipo ENUM('entrada', 'salida') NOT NULL,
        cantidad INT NOT NULL,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE
    )
`, (err) => {
    if (err) {
        console.error('❌ Error al crear tabla "movimientos":', err);
        return;
    }
    console.log('✅ Tabla "movimientos" lista');

    // ✅ INICIA EL SERVIDOR EXPRESS SOLO DESPUÉS DE CREAR TODO!
    app.listen(PORT, () => {
        console.log(`\n✅ ¡Todo listo!`);
        console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
        console.log(`💡 Prueba: http://localhost:${PORT}/productos`);
    });
});
    });
});

// === MIDDLEWARE ===
app.use(cors({ origin: '*' }));
app.use(bodyParser.json());

// === RUTAS ===

app.get('/', (req, res) => {
    res.send('Servidor funcionando');
});

// === RUTAS CRUD PARA PRODUCTOS ===

app.get('/productos', (req, res) => {
    const sql = "SELECT * FROM productos";
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ msg: err.message });
        res.json(results);
    });
});

// ✅ NUEVA RUTA: Obtener un producto por ID (¡ES NECESARIA PARA EDITAR!)
app.get('/productos/:id', (req, res) => {
    const { id } = req.params;
    const sql = "SELECT * FROM productos WHERE id = ?";
    db.query(sql, [id], (err, results) => {
        if (err) return res.status(500).json({ msg: err.message });
        if (results.length === 0) {
            return res.status(404).json({ msg: 'Producto no encontrado' });
        }
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

// ✅ CORREGIDO: Ahora elimina de la tabla "productos", no de "usuarios"
app.delete('/productos/:id', (req, res) => {
    const { id } = req.params;
    const sql = "DELETE FROM productos WHERE id = ?"; // ✅ Correcto
    db.query(sql, [id], (err) => {
        if (err) return res.status(500).json({ msg: err.message });
        res.json({ msg: 'Producto eliminado' });
    });
});

// === RUTAS PARA MOVIMIENTOS ===

app.get('/movimientos', (req, res) => {
    const sql = `
        SELECT m.id, m.tipo, m.cantidad, m.fecha, p.nombre AS producto 
        FROM movimientos m 
        JOIN productos p ON m.producto_id = p.id 
        ORDER BY m.fecha DESC
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ msg: err.message });
        res.json(results);
    });
});

app.post('/movimientos/entrada', (req, res) => {
    const { producto_id, cantidad } = req.body;
    const sql = `INSERT INTO movimientos (producto_id, tipo, cantidad) VALUES (?, 'entrada', ?)`;
    
    db.query(sql, [producto_id, cantidad], (err, result) => {
        if (err) return res.status(500).json({ msg: err.message });

        const updateStock = `UPDATE productos SET stock = stock + ? WHERE id = ?`;
        db.query(updateStock, [cantidad, producto_id], (err) => {
            if (err) return res.status(500).json({ msg: err.message });
            res.status(201).json({ msg: 'Entrada registrada y stock actualizado' });
        });
    });
});

app.post('/movimientos/salida', (req, res) => {
    const { producto_id, cantidad } = req.body;
    
    const checkStock = `SELECT stock FROM productos WHERE id = ?`;
    db.query(checkStock, [producto_id], (err, results) => {
        if (err) return res.status(500).json({ msg: err.message });
        
        const stockActual = results[0]?.stock;
        if (!stockActual) return res.status(404).json({ msg: 'Producto no encontrado' });
        if (cantidad > stockActual) return res.status(400).json({ msg: 'Stock insuficiente' });

        const sql = `INSERT INTO movimientos (producto_id, tipo, cantidad) VALUES (?, 'salida', ?)`;
        db.query(sql, [producto_id, cantidad], (err, result) => {
            if (err) return res.status(500).json({ msg: err.message });

            const updateStock = `UPDATE productos SET stock = stock - ? WHERE id = ?`;
            db.query(updateStock, [cantidad, producto_id], (err) => {
                if (err) return res.status(500).json({ msg: err.message });
                res.status(201).json({ msg: 'Salida registrada y stock actualizado' });
            });
        });
    });
});

// === RUTAS DE AUTENTICACIÓN ===

app.post('/auth/register', async (req, res) => {
    const { nombre, email, password, rol = 'usuario' } = req.body;

    if (!nombre || !email || !password) {
        return res.status(400).json({ msg: 'Todos los campos son obligatorios' });
    }

    try {
        const checkEmail = `SELECT * FROM usuarios WHERE email = ?`;
        db.query(checkEmail, [email], async (err, results) => {
            if (err) return res.status(500).json({ msg: 'Error en el servidor' });
            if (results.length > 0) {
                return res.status(400).json({ msg: 'El correo ya está registrado' });
            }

            const hashedPassword = await bcrypt.hash(password, saltRounds);
            const sql = `INSERT INTO usuarios (nombre, email, password, rol) VALUES (?, ?, ?, ?)`;
            db.query(sql, [nombre, email, hashedPassword, rol], (err, result) => {
                if (err) return res.status(500).json({ msg: 'Error al registrar' });
                res.status(201).json({ msg: 'Usuario registrado con éxito' });
            });
        });
    } catch (error) {
        res.status(500).json({ msg: 'Error interno del servidor' });
    }
});

app.post('/auth/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ msg: 'Email y contraseña son obligatorios' });
    }

    const sql = `SELECT id, nombre, email, rol, password FROM usuarios WHERE email = ?`;
    db.query(sql, [email], async (err, results) => {
        if (err) return res.status(500).json({ msg: 'Error en el servidor' });
        if (results.length === 0) return res.status(400).json({ msg: 'Credenciales inválidas' });

        const usuario = results[0];
        const validPassword = await bcrypt.compare(password, usuario.password);

        if (!validPassword) return res.status(400).json({ msg: 'Credenciales inválidas' });

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

app.get('/usuarios', (req, res) => {
    const sql = "SELECT id, nombre, email, rol, fecha_registro FROM usuarios ORDER BY id DESC";
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ msg: err.message });
        res.json(results);
    });
});

// ✅ CORREGIDO: "DETE" → "DELETE"
app.delete('/usuarios/:id', (req, res) => {
    const { id } = req.params;
    if (id == 1) {
        return res.status(403).json({ msg: 'No se puede eliminar al usuario principal' });
    }
    const sql = "DELETE FROM usuarios WHERE id = ?"; // ✅ Correcto
    db.query(sql, [id], (err) => {
        if (err) return res.status(500).json({ msg: err.message });
        res.json({ msg: 'Usuario eliminado' });
    });
});