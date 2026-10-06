<?php
declare(strict_types=1);
final class ApiError extends RuntimeException {
    public function __construct(public int $status, string $message) { parent::__construct($message); }
}
function validate_categories(mixed $items): array {
    if (!is_array($items) || !array_is_list($items) || count($items) > 200) throw new ApiError(422, 'Допустимо не более 200 своих категорий.');
    $ids = []; $names = array_map(fn($n) => mb_strtolower($n, 'UTF-8'), ['Продукты','Кафе и рестораны','Транспорт','Дом и счета','Покупки','Здоровье','Развлечения','Другое']); $result = [];
    foreach ($items as $c) {
        if (!is_array($c) || !is_string($c['id']??null) || !preg_match('/^custom-[a-zA-Z0-9_-]{1,64}$/D', $c['id']) || isset($ids[$c['id']])
            || !is_string($c['name']??null) || !trim($c['name']) || mb_strlen(trim($c['name']), 'UTF-8') > 40
            || in_array(mb_strtolower(trim($c['name']), 'UTF-8'), $names, true)
            || !is_string($c['color']??null) || !preg_match('/^#[0-9a-fA-F]{6}$/D', $c['color'])
            || !is_string($c['icon']??null) || !trim($c['icon']) || mb_strlen($c['icon'], 'UTF-8') > 8) throw new ApiError(422, 'Проверьте название, значок и цвет категории. Названия не должны повторяться.');
        $ids[$c['id']] = true; $names[] = mb_strtolower(trim($c['name']), 'UTF-8');
        $result[] = ['id'=>$c['id'], 'name'=>trim($c['name']), 'color'=>$c['color'], 'icon'=>$c['icon']];
    }
    return $result;
}
function validate_expenses(mixed $items, array $custom = []): array {
    if (!is_array($items) || !array_is_list($items) || count($items) > 100000) {
        throw new ApiError(422, 'Ожидается список не более 100 000 расходов.');
    }
    $result = []; $seen = [];
    foreach ($items as $e) {
        if (!is_array($e) || !is_string($e['id'] ?? null)
            || !preg_match('/^[a-zA-Z0-9_-]{1,128}$/D', $e['id']) || isset($seen[$e['id']])
            || !is_int($e['amount'] ?? null) || $e['amount'] < 1 || $e['amount'] > 9999999999
            || !in_array($e['category'] ?? null, array_merge(['food','cafe','transport','home','shopping','health','fun','other'], array_column($custom, 'id')), true)
            || !is_string($e['date'] ?? null) || !preg_match('/^\d{4}-\d{2}-\d{2}$/D', $e['date'])
            || $e['date'] < '1900-01-01' || $e['date'] > '2100-12-31'
            || !checkdate((int) substr($e['date'],5,2), (int) substr($e['date'],8,2), (int) substr($e['date'],0,4))
            || !is_string($e['note'] ?? null) || mb_strlen($e['note'], 'UTF-8') > 200) {
            throw new ApiError(422, 'Некорректные или повторяющиеся расходы. Проверьте сумму, дату, категорию и заметку.');
        }
        $seen[$e['id']] = true;
        $result[] = array_intersect_key($e, array_flip(['id','amount','category','date','note']));
    }
    return $result;
}
function credentials(array $body): array {
    $email = strtolower(trim(is_string($body['email'] ?? null) ? $body['email'] : ''));
    $password = $body['password'] ?? '';
    if (strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL)
        || !is_string($password) || strlen($password) < 12 || strlen($password) > 72) {
        throw new ApiError(422, 'Введите email и пароль длиной от 12 до 72 байт (для кириллицы — до 36 букв).');
    }
    return [$email, $password];
}
