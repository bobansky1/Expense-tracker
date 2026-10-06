<?php
declare(strict_types=1);
require_once __DIR__ . '/validation.php';
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
function respond(array $data, int $status = 200): never {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    exit;
}
function query(PDO $db, string $sql, array $args = []): PDOStatement {
    $stmt = $db->prepare($sql); $stmt->execute($args); return $stmt;
}
function snapshot(PDO $db, string $id, int $revision): array {
    $rows = query($db, 'SELECT id, amount_kopecks, category, spent_on, note FROM expenses WHERE user_id = ? ORDER BY spent_on DESC, id', [$id])->fetchAll();
    return ['categories' => query($db, 'SELECT id,name,color,icon FROM categories WHERE user_id=? ORDER BY id', [$id])->fetchAll(), 'revision' => $revision, 'expenses' => array_map(fn($e) => [
        'id'=>$e['id'], 'amount'=>(int)$e['amount_kopecks'], 'category'=>$e['category'], 'date'=>$e['spent_on'], 'note'=>$e['note']
    ], $rows)];
}
function throttle(PDO $db, string $key, int $limit): void {
    $bucket = hash('sha256', $key); $now = time();
    query($db, 'INSERT INTO login_attempts (bucket, attempts, expires_at) VALUES (?,1,?) ON DUPLICATE KEY UPDATE attempts=IF(expires_at <= ?,1,attempts+1), expires_at=IF(expires_at <= ?,VALUES(expires_at),expires_at)', [$bucket,$now+900,$now,$now]);
    $row = query($db, 'SELECT attempts, expires_at FROM login_attempts WHERE bucket=?', [$bucket])->fetch();
    if ((int)$row['attempts'] > $limit) {
        header('Retry-After: ' . max(1, (int)$row['expires_at']-$now));
        throw new ApiError(429, 'Слишком много попыток входа. Попробуйте через 15 минут.');
    }
    if (random_int(1,100) === 1) query($db, 'DELETE FROM login_attempts WHERE expires_at < ? LIMIT 1000', [$now]);
}
$db = null;
try {
    if (!is_file(__DIR__ . '/config.php')) throw new ApiError(503, 'Сервер ещё не настроен. Заполните private/config.php по инструкции Beget.');
    $config = require __DIR__ . '/config.php';
    $origin = rtrim($config['origin'] ?? '', '/');
    if (!$origin || !filter_var($origin, FILTER_VALIDATE_URL)) throw new ApiError(503, 'Проверьте адрес сайта в настройках сервера.');
    $secure = $config['secure_cookies'] ?? true;
    if (!$secure && !in_array(parse_url($origin, PHP_URL_HOST), ['localhost','127.0.0.1','[::1]'], true)) {
        throw new ApiError(503, 'Для размещённого сайта включите secure_cookies и HTTPS.');
    }
    if ($secure && !str_starts_with($origin, 'https://')) throw new ApiError(503, 'В настройках нужен адрес HTTPS.');
    ini_set('session.use_strict_mode', '1'); ini_set('session.use_only_cookies', '1');
    ini_set('session.gc_maxlifetime', '604800');
    $sessionDir = __DIR__ . '/sessions';
    if (!is_dir($sessionDir) && !mkdir($sessionDir, 0700, true)) throw new RuntimeException('Cannot create session directory');
    session_save_path($sessionDir);
    session_name('traty_session');
    session_set_cookie_params(['lifetime'=>604800,'path'=>'/','secure'=>$secure,'httponly'=>true,'samesite'=>'Strict']);
    session_start();
    if (isset($_SESSION['expires']) && $_SESSION['expires'] < time()) { $_SESSION = []; session_regenerate_id(true); }
    $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
    $action = $_GET['action'] ?? 'session';
    $method = $_SERVER['REQUEST_METHOD'];
    if (!in_array($method, ['GET','POST'], true)) throw new ApiError(405, 'Метод не поддерживается.');
    $body = [];
    if ($method === 'POST') {
        if (($_SERVER['HTTP_ORIGIN'] ?? '') !== $origin
            || !hash_equals($_SESSION['csrf'], $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) {
            throw new ApiError(403, 'Проверка безопасности не пройдена. Обновите страницу.');
        }
        if (!str_starts_with(strtolower($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json')) throw new ApiError(415, 'Нужен формат JSON.');
        $raw = file_get_contents('php://input', false, null, 0, 26*1024*1024+1);
        if (strlen($raw) > 26*1024*1024) throw new ApiError(413, 'Файл слишком большой: максимум 25 МБ.');
        try { $body = json_decode($raw, true, 512, JSON_THROW_ON_ERROR); }
        catch (JsonException) { throw new ApiError(400, 'Некорректный JSON.'); }
        if (!is_array($body) || array_is_list($body)) throw new ApiError(400, 'Ожидается объект JSON.');
    }
    $db = new PDO('mysql:host='.$config['db_host'].';port='.($config['db_port']??3306).';dbname='.$config['db_name'].';charset=utf8mb4',
        $config['db_user'], $config['db_password'], [
            PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES=>false, PDO::ATTR_TIMEOUT=>5
        ]);
    $setup = !(bool)query($db, 'SELECT setup_complete FROM app_meta WHERE id=1')->fetchColumn();
    if ($action === 'session' && $method === 'GET') {
        $user = isset($_SESSION['user']) ? query($db, 'SELECT id,email FROM users WHERE id=?', [$_SESSION['user']])->fetch() : false;
        respond(['user'=>$user ?: null, 'csrf'=>$_SESSION['csrf'], 'setupRequired'=>$setup]);
    }
    if (in_array($action, ['login','setup'], true) && $method === 'POST') {
        throttle($db, 'ip:'.($_SERVER['REMOTE_ADDR']??'unknown'), 50);
        [$email,$password] = credentials($body);
        throttle($db, 'email:'.$email, 10);
        if ($action === 'setup') {
            $token = $config['setup_token'] ?? '';
            if (!$setup || strlen($token) < 32 || str_starts_with($token, 'REPLACE_')
                || !is_string($body['token'] ?? null) || !hash_equals($token, $body['token'])) {
                throw new ApiError(403, 'Первичная настройка недоступна или код неверен.');
            }
            $hash = password_hash($password, PASSWORD_BCRYPT, ['cost'=>12]);
            $db->beginTransaction();
            if ((bool)query($db, 'SELECT setup_complete FROM app_meta WHERE id=1 FOR UPDATE')->fetchColumn()) throw new ApiError(409, 'Аккаунт уже создан. Войдите.');
            $id = bin2hex(random_bytes(16));
            query($db, 'INSERT INTO users (id,email,password_hash) VALUES (?,?,?)', [$id,$email,$hash]);
            query($db, 'UPDATE app_meta SET setup_complete=1 WHERE id=1');
            $db->commit();
            $user = ['id'=>$id,'email'=>$email];
        } else {
            $user = query($db, 'SELECT id,email,password_hash FROM users WHERE email=?', [$email])->fetch();
            // Fixed dummy bcrypt hash keeps missing-user and wrong-password paths comparable.
            $hash = $user['password_hash'] ?? '$2y$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';
            if (!password_verify($password, $hash) || !$user) throw new ApiError(401, 'Неверный email или пароль.');
        }
        session_regenerate_id(true);
        $_SESSION = ['user'=>$user['id'], 'csrf'=>bin2hex(random_bytes(32)), 'expires'=>time()+604800];
        respond(['user'=>['id'=>$user['id'],'email'=>$user['email']], 'csrf'=>$_SESSION['csrf'], 'setupRequired'=>false]);
    }
    if ($action === 'logout' && $method === 'POST') {
        $_SESSION = []; session_regenerate_id(true); $_SESSION['csrf'] = bin2hex(random_bytes(32));
        respond(['user'=>null,'csrf'=>$_SESSION['csrf'],'setupRequired'=>false]);
    }
    $userId = $_SESSION['user'] ?? null;
    if (!$userId) throw new ApiError(401, 'Войдите в аккаунт, чтобы открыть расходы.');
    if (($action === 'expenses' && $method === 'GET') || ($action === 'mutate' && $method === 'POST')) {
        $db->beginTransaction();
        $user = query($db, 'SELECT revision FROM users WHERE id=? FOR UPDATE', [$userId])->fetch();
        if (!$user) throw new ApiError(401, 'Войдите в аккаунт заново.');
        $revision = (int)$user['revision'];
        if ($action === 'mutate') {
            if (!is_int($body['revision']??null) || $body['revision'] !== $revision) throw new ApiError(409, 'Данные изменились в другом окне. Обновите список и повторите действие.');
            $type = $body['type']??'';
            $insert = 'INSERT INTO expenses (user_id,id,amount_kopecks,category,spent_on,note) VALUES (?,?,?,?,?,?)';
            $custom = query($db, 'SELECT id,name,color,icon FROM categories WHERE user_id=? ORDER BY id', [$userId])->fetchAll();
            if ($type === 'category' || (($type === 'replace' || $type === 'merge') && isset($body['categories']))) {
                $incoming = validate_categories($type === 'category' ? [$body['category']??null] : $body['categories']);
                $combined = array_column($custom, null, 'id');
                foreach ($incoming as $c) {
                    if (isset($combined[$c['id']]) && $combined[$c['id']] != $c) throw new ApiError(409, 'Категория с этим ID уже существует с другими данными.');
                    $combined[$c['id']] = $c;
                }
                $custom = validate_categories(array_values($combined));
                foreach ($incoming as $c) query($db, 'INSERT INTO categories (user_id,id,name,color,icon) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE id=VALUES(id)', [$userId,$c['id'],$c['name'],$c['color'],$c['icon']]);
            }
            if ($type === 'category') {
                // Category insert and revision update share the expense transaction.
            } elseif ($type === 'upsert') {
                $e = validate_expenses([$body['expense']??null], $custom)[0];
                $exists = (bool)query($db, 'SELECT 1 FROM expenses WHERE user_id=? AND id=?', [$userId,$e['id']])->fetchColumn();
                if (!$exists && (int)query($db,'SELECT COUNT(*) FROM expenses WHERE user_id=?',[$userId])->fetchColumn() >= 100000) throw new ApiError(422,'Лимит — 100 000 расходов.');
                query($db, $insert.' ON DUPLICATE KEY UPDATE amount_kopecks=VALUES(amount_kopecks),category=VALUES(category),spent_on=VALUES(spent_on),note=VALUES(note)',
                    [$userId,$e['id'],$e['amount'],$e['category'],$e['date'],$e['note']]);
            } elseif ($type === 'delete') {
                if (!is_string($body['id']??null)) throw new ApiError(422,'Некорректный расход.');
                query($db, 'DELETE FROM expenses WHERE user_id=? AND id=?', [$userId,$body['id']]);
            } elseif ($type === 'replace' || $type === 'merge') {
                $items = validate_expenses($body['expenses']??null, $custom);
                if ($type === 'replace') query($db, 'DELETE FROM expenses WHERE user_id=?', [$userId]);
                // Merge is idempotent and refuses conflicting IDs; it never silently overwrites records.
                $existing = snapshot($db,$userId,$revision)['expenses'];
                $byId = array_column($existing,null,'id');
                $statement = $db->prepare($insert);
                $count = count($existing);
                foreach ($items as $e) {
                    if (isset($byId[$e['id']])) {
                        if ($byId[$e['id']] != $e) throw new ApiError(409,'В копии есть запись с тем же ID и другими данными. Скачайте обе копии для сравнения.');
                        continue;
                    }
                    if (++$count > 100000) throw new ApiError(422,'Лимит — 100 000 расходов.');
                    $statement->execute([$userId,$e['id'],$e['amount'],$e['category'],$e['date'],$e['note']]);
                }
            } else throw new ApiError(422,'Неизвестное действие.');
            query($db, 'UPDATE users SET revision=revision+1 WHERE id=?', [$userId]);
            $revision++;
        }
        $result = snapshot($db,$userId,$revision);
        $db->commit();
        respond($result);
    }
    throw new ApiError(404, 'Действие не найдено.');
} catch (Throwable $error) {
    if ($db instanceof PDO && $db->inTransaction()) $db->rollBack();
    if ($error instanceof ApiError) respond(['error'=>$error->getMessage()],$error->status);
    // Do not log SQL parameters, passwords or raw exception messages.
    error_log('Traty server error: '.get_class($error).' code '.$error->getCode());
    respond(['error'=>'Сервер временно недоступен. Проверьте подключение к базе и импорт схемы. Ваши изменения не подтверждены.'],503);
}
