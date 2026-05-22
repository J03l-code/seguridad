<?php
require 'config.php';
try {
    $pdo->exec("ALTER TABLE users MODIFY COLUMN hierarchy_level ENUM('superintendente', 'voluntario_clave', 'auxiliar', 'secretaria', 'admin') DEFAULT 'auxiliar'");
    echo "Database updated successfully.";
} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
