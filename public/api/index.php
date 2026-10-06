<?php
declare(strict_types=1);
$private = getenv('TRATY_PRIVATE_DIR') ?: dirname(__DIR__, 2) . '/private';
require $private . '/app.php';
