<?php
// php -S 127.0.0.1:8081 -t public server/router.php
putenv('TRATY_PRIVATE_DIR=' . __DIR__);
if (parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) === '/api/index.php') {
    require dirname(__DIR__) . '/public/api/index.php';
    return true;
}
return false;
