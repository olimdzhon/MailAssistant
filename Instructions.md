# Инструкция по созданию и использованию LLM Wiki + Notion

---

## Шаг 1. Создание базы знаний LLM Wiki

**Промт:**
```
Действуй как LLM Wiki агент. Создай базу знаний CLAUDE.md и структурой папок
как указано тут: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
```

**Результат:** создана полная структура проекта:

```
Brain+Notion/
├── CLAUDE.md              # Схема и рабочие инструкции для Wiki-агента
├── index.md               # Каталог всех страниц вики
├── log.md                 # Хронологический журнал операций
├── raw/                   # Неизменяемые сырые источники
│   ├── README.md
│   └── assets/            # Изображения и медиа
└── wiki/                  # LLM-генерируемые страницы
    ├── README.md
    ├── entities/          # Люди, проекты, организации, инструменты
    ├── concepts/          # Идеи, теории, методы, паттерны
    ├── sources/           # Сводки по каждому источнику
    ├── synthesis/         # Обзоры, сравнения, тезисы
    └── outputs/           # Результаты запросов (слайды, графики)
```

В `CLAUDE.md` описаны 5 операций:
- **INGEST** — обработка нового источника (чтение → страница в sources → сущности/концепты → index + log)
- **QUERY** — ответ на вопрос по вики с цитатами, ценные ответы сохраняются обратно
- **NOTION_IMPORT** — загрузка задач из Notion в `raw/` через `scripts/notion_bridge.py`
- **NOTION_EXPORT** — создание задач в Notion из синтеза вики
- **LINT** — проверка здоровья вики (противоречия, сироты, пробелы)

---

## Шаг 2. Интеграция с Notion

**Промт:**
```
Можно ли интегрировать Notion в данный проект для того чтобы создавать задачи
в Notion и загружать задачи из Notion во второй мозг чтобы заполнить задачами llm wiki
```

**Результат:** создан Python-мост `scripts/notion_bridge.py` с тремя командами:

| Команда | Назначение |
|---|---|
| `list` | Показать доступные базы данных |
| `pull` | Выгрузить задачи из Notion → `raw/` |
| `push` | Создать страницу в Notion ← wiki |

Дополнительно:
- `scripts/requirements.txt` — зависимости: `requests`, `python-dotenv`
- `scripts/.env.example` — шаблон конфигурации
- Операции `NOTION_IMPORT` и `NOTION_EXPORT` добавлены в `CLAUDE.md`

---

## Шаг 3. Загрузка задач после исправления токена

**Промт:**
```
загрузи задачи
```

**Проверка токена:** длина 50, префикс `ntn_`, не шаблон → OK.

**Результат:**
- `list` → базы не найдены (поиск по workspace пуст)
- `pull` с ID `374a7db9f5d2800fa922f7fa45d30723` → 404 «не найден»

**Отладка:**
- Прямой запрос к API показал: ID `374a7db9...` — это база данных, не страница
- Поиск обнаружил 6 объектов: база **Tasks Tracker** + 5 страниц внутри
- Запрос `/databases/{id}/query` → успех, 4 задачи с данными

**Исправление бага в скрипте:** все задачи получали одинаковое имя файла (первые 12 символов ID совпадают). Исправлено — теперь используется полный 32-символьный ID.

**Итог:** 4 задачи выгружены в `raw/`:

| Файл | Задача |
|---|---|
| `raw/notion_task_374...468.md` | Improve website copy (Done, High, Polish) |
| `raw/notion_task_374...9e3.md` | Update help center & FAQ (In progress, Medium, Feature request) |
| `raw/notion_task_374...9d8.md` | Publish release notes (Not started, Low, Feature request) |
| `raw/notion_task_374...9c3.md` | Пустая задача (Not started, без описания) |

---

## Шаг 4. Обработка источников (INGEST)

**Промт:**
```
Continue where you left off
```

**Результат:** полный цикл INGEST по протоколу из `CLAUDE.md`:

**Созданы страницы источников** (4) в `wiki/sources/`:
- `Improve website copy.md`
- `Update help center FAQ.md`
- `Publish release notes.md`
- `Empty task.md`

**Созданы страницы сущностей** (4) в `wiki/entities/`:
- `Olimjon Sadykov.md` — куратор, исполнитель
- `Проект Website.md` — проект веб-сайта
- `Проект Help Center.md` — проект документации
- `Проект Release Notes.md` — проект релизных заметок

**Созданы страницы концептов** (4) в `wiki/concepts/`:
- `Типы задач Notion.md` — Polish, Feature request
- `Управление приоритетами.md` — High/Medium/Low
- `Документация продукта.md` — поддержка docs
- `Релиз-менеджмент.md` — публикация release notes

**Создана синтез-страница** (1) в `wiki/synthesis/`:
- `Обзор задач из Notion 2026-06-03.md` — статистика, выводы, паттерны

**Обновлены:** `index.md` (каталог) и `log.md` (журнал).

---

## Шаг 5. Документирование процесса

**Промт:**
```
дай пошаговую инструкцию как ты настроил интеграцию с Notion
```

**Результат:** объяснена архитектура моста, разница между Internal Connection и PAT,
последовательность API-запросов.

**Промт:**
```
Запиши все промты этой сессии в файл Instructions.md, и оформи их как пошаговую инструкцию
```

**Результат:** этот файл.

---

## Итоговая структура проекта

```
Brain+Notion/
├── CLAUDE.md                                    # Схема работы Wiki-агента
├── Instructions.md                              # ← этот файл
├── index.md                                     # Каталог: 4 источника, 4 сущности, 4 концепта, 1 синтез
├── log.md                                       # Журнал: init + notion_import
├── venv/                                        # Python-окружение
├── raw/
│   ├── README.md
│   ├── assets/
│   └── notion_task_*.md (×4)                    # Задачи из Notion
├── scripts/
│   ├── notion_bridge.py                         # Мост Notion ↔ Wiki
│   ├── requirements.txt
│   ├── .env.example
│   └── .env                                     # NOTION_API_KEY (в .gitignore!)
└── wiki/
    ├── README.md
    ├── entities/ (×4)                           # Olimjon Sadykov + 3 проекта
    ├── concepts/ (×4)                           # Типы задач, приоритеты, docs, релизы
    ├── sources/ (×4)                            # Сводки по задачам
    ├── synthesis/ (×1)                          # Обзор задач
    └── outputs/
```

## Полезные команды

```bash
# Активировать окружение
cd "/Users/olimdzonsadykov/Desktop/Brain+Notion"
source venv/bin/activate

# Показать базы Notion
python scripts/notion_bridge.py list

# Выгрузить задачи
python scripts/notion_bridge.py pull --db-id "ID_ТВОЕЙ_БАЗЫ"

# Создать задачу в Notion
python scripts/notion_bridge.py push \
    --db NOTION_DB_TASKS \
    --title "Новая задача" \
    --content "Описание из вики" \
    --status "To Do"
```

## Как повторить с нуля на другом компьютере

1. Клонировать проект (или скопировать папку)
2. `python3 -m venv venv && source venv/bin/activate`
3. `pip install -r scripts/requirements.txt`
4. `cp scripts/.env.example scripts/.env`
5. Получить PAT: https://www.notion.so/developers/connections → Build → Personal access tokens → Create
6. Вставить токен в `scripts/.env` → `NOTION_API_KEY=ntn_...`
7. Найти ID базы в URL Notion → вставить в `.env` → `NOTION_DB_TASKS=...`
8. `python scripts/notion_bridge.py pull --db NOTION_DB_TASKS`
9. Сказать агенту: «обработай источники из raw/»
