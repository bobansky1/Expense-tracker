<?php
// Copy to config.php in the private directory, OUTSIDE public_html.
return [
    'origin' => 'https://your-domain.ru',
    'secure_cookies' => true,
    'db_host' => 'localhost',
    'db_port' => 3306,
    'db_name' => 'login_traty',
    'db_user' => 'login_traty',
    'db_password' => 'CHANGE_ME',
    // Generate once: php -r "echo bin2hex(random_bytes(32));"
    'setup_token' => 'REPLACE_WITH_A_RANDOM_TOKEN_OF_AT_LEAST_32_CHARACTERS',
];
