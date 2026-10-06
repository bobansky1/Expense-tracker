<?php
declare(strict_types=1);
// Test-only fixture. Refuses database names outside its dedicated namespace.
$name = $argv[1] ?? '';
if (!preg_match('/^traty_test_[0-9_]+$/D', $name)) throw new RuntimeException('Unsafe test database name');
$db = new PDO('mysql:host=127.0.0.1;port=33316;charset=utf8mb4','root','',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
if (($argv[2]??'') === 'second-user') {
    $db->exec("USE `$name`");
    $s=$db->prepare('INSERT INTO users (id,email,password_hash) VALUES (?,?,?)');
    $s->execute(['second-user','second@example.test',password_hash('second-test-password',PASSWORD_BCRYPT,['cost'=>12])]);
    exit;
}
$db->exec("CREATE DATABASE `$name` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
$db->exec("USE `$name`");
$schema=file_get_contents(dirname(__DIR__).'/docs/mysql-schema.sql');
foreach (explode(';',$schema) as $sql) if (trim($sql)) $db->exec($sql);
$dir = dirname(__DIR__).'/.test-runtime/'.$name;
mkdir($dir,0700,true);
foreach (['app.php','validation.php'] as $file) copy(dirname(__DIR__).'/server/'.$file,$dir.'/'.$file);
$config=['origin'=>'http://127.0.0.1:18081','secure_cookies'=>false,
    'db_host'=>'127.0.0.1','db_port'=>33316,'db_name'=>$name,'db_user'=>'root','db_password'=>'',
    'setup_token'=>str_repeat('test-only-',8)];
file_put_contents($dir.'/config.php',"<?php\nreturn ".var_export($config,true).";\n");
echo $dir;
