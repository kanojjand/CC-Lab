import { parseTranslations } from './i18n.js';
import { normalizeTags } from './util.js';

const CATEGORIES = [
  { slug: 'courses', name: 'Курсы', description: 'Готовые курсы с уроками, заданиями и материалами для учителя.' },
  { slug: 'school-websites', name: 'Сайты для школ', description: 'Сайт школы или кружка вместе с образовательной программой — под ключ.' },
  { slug: 'programs', name: 'Образовательные программы', description: 'Рабочие программы, КТП и методички для внедрения в учебный план.' },
  { slug: 'platforms', name: 'Платформы', description: 'Онлайн-тренажёры, LMS и цифровые сервисы для уроков.' },
];

// Переводы стартовых категорий (по slug)
const CATEGORY_TRANSLATIONS = {
  courses: {
    kk: { name: 'Курстар', description: 'Сабақтары, тапсырмалары және мұғалімге арналған материалдары бар дайын курстар.' },
    en: { name: 'Courses', description: 'Ready-made courses with lessons, assignments and teacher materials.' },
  },
  'school-websites': {
    kk: { name: 'Мектеп сайттары', description: 'Мектептің немесе үйірменің сайты білім беру бағдарламасымен бірге — толық дайын күйінде.' },
    en: { name: 'School websites', description: 'A school or club website together with an educational program — turnkey.' },
  },
  programs: {
    kk: { name: 'Білім беру бағдарламалары', description: 'Оқу жоспарына енгізуге арналған жұмыс бағдарламалары, КТЖ және әдістемелік құралдар.' },
    en: { name: 'Educational programs', description: 'Curricula, lesson schedules and teacher guides that fit into the school plan.' },
  },
  platforms: {
    kk: { name: 'Платформалар', description: 'Сабаққа арналған онлайн-тренажёрлар, LMS және цифрлық сервистер.' },
    en: { name: 'Platforms', description: 'Online trainers, LMS and digital services for lessons.' },
  },
};

// Демо-разработки: помечены is_demo и удаляются одной кнопкой в админке.
const PRODUCTS = [
  {
    category: 'courses',
    title: 'Робототехника: от LEGO до Arduino',
    tagline: 'Двухлетний курс для 5–9 классов: от первых механизмов до собственных устройств на микроконтроллере.',
    audience: '5–9 класс',
    duration: '68 уроков · 2 учебных года',
    format: 'Очно, в классе или кружке',
    tags: 'робототехника, arduino, lego, проекты',
    price: 250000,
    price_note: 'лицензия на школу / год',
    featured: 1,
    description:
      'Курс выстроен так, чтобы его мог вести учитель информатики или технологии без опыта в робототехнике.\n\n' +
      'Каждый урок — это готовый сценарий: цель, объяснение, сборка, программирование и короткая рефлексия. ' +
      'В конце каждого модуля ученики защищают мини-проект.\n\n' +
      '**Оборудование:** наборы LEGO Education SPIKE или аналоги, Arduino Uno, базовый набор датчиков.',
    features:
      '68 поурочных планов с презентациями\nВидеоинструкции к каждой сборке\nЗадания и критерии оценивания\n' +
      'Список оборудования и схемы подключения\nДва вебинара для педагога и чат поддержки',
    modules:
      'Механика — передачи, рычаги и первые движущиеся модели\nДатчики — расстояние, цвет, касание; роботы, которые «видят»\n' +
      'Алгоритмы — циклы, условия и движение по линии\nArduino — электроника, макетная плата, светодиоды и моторы\n' +
      'Проектная работа — команда, идея, прототип и защита',
  },
  {
    category: 'school-websites',
    title: 'Сайт школы + программа «Цифровая грамотность»',
    tagline: 'Современный сайт школы с админкой и встроенным курсом цифровой грамотности для 5–7 классов.',
    audience: 'Школы, лицеи, гимназии',
    duration: 'Запуск за 3–4 недели',
    format: 'Под ключ',
    tags: 'сайт школы, цифровая грамотность, lms',
    price: null,
    price_note: 'зависит от объёма',
    featured: 1,
    description:
      'Делаем сайт, который удобно обновлять самим: новости, расписание, страницы кружков и раздел с курсами.\n\n' +
      'В комплекте — программа «Цифровая грамотность» на 34 часа: безопасность в сети, работа с информацией, ' +
      'основы алгоритмов. Уроки открываются ученикам прямо на сайте школы.',
    features:
      'Сайт на домене школы с удобной админкой\nРазделы: новости, расписание, кружки, курсы\n' +
      'Программа «Цифровая грамотность» — 34 часа\nХостинг, SSL и поддержка — 1 год\nОбучение администратора сайта',
    modules:
      'Аналитика — встреча с администрацией, структура и контент\nДизайн — макет в фирменном стиле школы\n' +
      'Разработка — сайт, админка, раздел курсов\nЗапуск — перенос материалов, обучение, передача доступов',
  },
  {
    category: 'courses',
    title: 'Python для школьников',
    tagline: 'Программирование с нуля на понятных задачах: игры, чат-боты и анализ данных.',
    audience: '7–9 класс',
    duration: '34 урока · 1 учебный год',
    format: 'Очно или онлайн',
    tags: 'программирование, python, информатика',
    price: 120000,
    price_note: 'лицензия на школу / год',
    featured: 0,
    description:
      'Курс закрывает раздел программирования по информатике и выходит за его рамки: ученики пишут ' +
      'небольшие игры, Telegram-бота и простые программы для анализа данных.\n\n' +
      'Автопроверка задач экономит учителю время на проверке домашних работ.',
    features:
      '34 урока с презентациями и конспектами\n200+ задач с автопроверкой\nКонтрольные и итоговый проект\nМетодичка для учителя',
    modules:
      'Основы — переменные, ввод-вывод, условия\nЦиклы и функции — пишем первую игру\nСписки и строки — обработка данных\n' +
      'Проект — Telegram-бот или мини-игра на выбор',
  },
  {
    category: 'programs',
    title: 'Программа кружка «3D-моделирование и печать»',
    tagline: 'Готовая рабочая программа для кружка или внеурочки: от первого эскиза до напечатанной модели.',
    audience: '6–11 класс',
    duration: '72 часа',
    format: 'Кружок / внеурочная деятельность',
    tags: '3d-моделирование, 3d-печать, технология',
    price: 60000,
    price_note: 'бессрочно',
    featured: 0,
    description:
      'Пакет документов и материалов, чтобы открыть кружок 3D-моделирования уже в этом учебном году.\n\n' +
      'Работаем в бесплатных программах (Tinkercad, Blender), поэтому лицензии покупать не нужно.',
    features:
      'Рабочая программа и календарно-тематический план\nПоурочные разработки на 72 часа\n' +
      'Библиотека учебных моделей\nРекомендации по выбору 3D-принтера и пластика',
    modules:
      'Знакомство — интерфейс и простые фигуры\nМоделирование — сложные формы и сборки\nПечать — слайсер, настройки, постобработка\n' +
      'Проект — модель для школы или города',
  },
  {
    category: 'courses',
    title: 'Лаборатория IoT: умная школа',
    tagline: 'Проектный курс по интернету вещей: ученики собирают датчики и выводят данные школы на дашборд.',
    audience: '8–11 класс',
    duration: '36 часов',
    format: 'Проектная работа в командах',
    tags: 'iot, электроника, проекты, робототехника',
    price: 180000,
    price_note: 'лицензия на школу / год',
    featured: 1,
    description:
      'Ученики проектируют систему «умной школы»: измеряют температуру и CO₂ в классах, освещённость, ' +
      'шум в столовой — и выводят данные на общий онлайн-дашборд.\n\n' +
      'Курс отлично подходит для научно-практических конференций и конкурсов проектов.',
    features:
      '36 часов проектных занятий\nСхемы и код для ESP32\nГотовый облачный дашборд для школы\nШаблоны защиты проектов',
    modules:
      'Электроника — датчики, питание, пайка\nESP32 — Wi-Fi и отправка данных\nДашборд — графики и уведомления\nЗащита — презентация проекта',
  },
  {
    category: 'platforms',
    title: 'Онлайн-тренажёр по алгоритмам',
    tagline: 'Задачи с автопроверкой и рейтингом класса — для уроков, домашки и подготовки к олимпиадам.',
    audience: '5–11 класс',
    duration: 'Подписка',
    format: 'Онлайн, в браузере',
    tags: 'алгоритмы, олимпиады, программирование',
    price: 15000,
    price_note: 'в месяц на школу',
    featured: 0,
    description:
      'Учитель создаёт класс, выдаёт подборки задач и видит прогресс каждого ученика. ' +
      'Задачи разбиты по темам и уровням сложности — от первых циклов до олимпиадных.',
    features: '1000+ задач с автопроверкой\nКлассы, подборки и дедлайны\nРейтинг и статистика по ученикам\nPython, C++, Pascal',
    modules: '',
  },
];

// Переводы демо-разработок (по русскому названию)
const PRODUCT_TRANSLATIONS = {
  'Робототехника: от LEGO до Arduino': {
    kk: {
      title: 'Робототехника: LEGO-дан Arduino-ға дейін',
      tagline: '5–9-сыныптарға арналған екі жылдық курс: алғашқы механизмдерден микроконтроллердегі өз құрылғыларына дейін.',
      audience: '5–9-сынып',
      duration: '68 сабақ · 2 оқу жылы',
      format: 'Бетпе-бет, сыныпта немесе үйірмеде',
      price_note: 'мектепке лицензия / жыл',
      description:
        'Курс робототехника бойынша тәжірибесі жоқ информатика немесе технология мұғалімі де жүргізе алатындай құрылған.\n\n' +
        'Әр сабақ — дайын сценарий: мақсат, түсіндіру, құрастыру, бағдарламалау және қысқа рефлексия. ' +
        'Әр модульдің соңында оқушылар шағын жобасын қорғайды.\n\n' +
        '**Құрал-жабдық:** LEGO Education SPIKE жинақтары немесе баламалары, Arduino Uno, датчиктердің базалық жинағы.',
      features:
        '68 сабақ жоспары мен презентациялар\nӘр құрастыруға бейненұсқаулық\nТапсырмалар мен бағалау критерийлері\n' +
        'Құрал-жабдық тізімі және қосылу сызбалары\nПедагогқа арналған екі вебинар және қолдау чаты',
      modules:
        'Механика — берілістер, иінтіректер және алғашқы қозғалмалы модельдер\nДатчиктер — қашықтық, түс, жанасу; «көретін» роботтар\n' +
        'Алгоритмдер — циклдер, шарттар және сызық бойымен қозғалыс\nArduino — электроника, макеттік тақта, жарықдиодтар мен моторлар\n' +
        'Жобалық жұмыс — команда, идея, прототип және қорғау',
    },
    en: {
      title: 'Robotics: from LEGO to Arduino',
      tagline: 'A two-year course for grades 5–9: from the first mechanisms to students’ own microcontroller devices.',
      audience: 'Grades 5–9',
      duration: '68 lessons · 2 school years',
      format: 'In person, in class or an after-school club',
      price_note: 'school license / year',
      description:
        'The course is designed so that a computer science or technology teacher with no robotics experience can teach it.\n\n' +
        'Every lesson is a ready-made scenario: goal, explanation, building, programming and a short reflection. ' +
        'At the end of each module students present a mini-project.\n\n' +
        '**Equipment:** LEGO Education SPIKE kits or equivalents, Arduino Uno, a basic sensor kit.',
      features:
        '68 lesson plans with slides\nVideo instructions for every build\nAssignments and grading criteria\n' +
        'Equipment list and wiring diagrams\nTwo teacher webinars and a support chat',
      modules:
        'Mechanics — gears, levers and the first moving models\nSensors — distance, color, touch; robots that “see”\n' +
        'Algorithms — loops, conditions and line following\nArduino — electronics, breadboards, LEDs and motors\n' +
        'Project work — team, idea, prototype and presentation',
    },
  },
  'Сайт школы + программа «Цифровая грамотность»': {
    kk: {
      title: 'Мектеп сайты + «Цифрлық сауаттылық» бағдарламасы',
      tagline: 'Әкімшілік панелі бар заманауи мектеп сайты және 5–7-сыныптарға арналған цифрлық сауаттылық курсы.',
      audience: 'Мектептер, лицейлер, гимназиялар',
      duration: '3–4 аптада іске қосу',
      format: 'Толық дайын күйінде',
      price_note: 'көлеміне байланысты',
      description:
        'Өздеріңіз оңай жаңартып отыратын сайт жасаймыз: жаңалықтар, сабақ кестесі, үйірмелер беттері және курстар бөлімі.\n\n' +
        'Жинақта — 34 сағаттық «Цифрлық сауаттылық» бағдарламасы: желідегі қауіпсіздік, ақпаратпен жұмыс, ' +
        'алгоритм негіздері. Сабақтар оқушыларға тікелей мектеп сайтында ашылады.',
      features:
        'Мектеп доменіндегі ыңғайлы әкімшілік панелі бар сайт\nБөлімдер: жаңалықтар, кесте, үйірмелер, курстар\n' +
        '«Цифрлық сауаттылық» бағдарламасы — 34 сағат\nХостинг, SSL және қолдау — 1 жыл\nСайт әкімшісін оқыту',
      modules:
        'Талдау — әкімшілікпен кездесу, құрылым және мазмұн\nДизайн — мектептің фирмалық стиліндегі макет\n' +
        'Әзірлеу — сайт, әкімшілік панель, курстар бөлімі\nІске қосу — материалдарды көшіру, оқыту, қолжетімділікті тапсыру',
    },
    en: {
      title: 'School website + “Digital Literacy” program',
      tagline: 'A modern school website with an admin panel and a built-in digital literacy course for grades 5–7.',
      audience: 'Schools, lyceums, gymnasiums',
      duration: 'Launch in 3–4 weeks',
      format: 'Turnkey',
      price_note: 'depends on scope',
      description:
        'We build a website that is easy to update yourselves: news, timetable, club pages and a courses section.\n\n' +
        'Included is the 34-hour “Digital Literacy” program: online safety, working with information and the basics of algorithms. ' +
        'Lessons open for students right on the school website.',
      features:
        'Website on the school’s domain with an easy admin panel\nSections: news, timetable, clubs, courses\n' +
        '“Digital Literacy” program — 34 hours\nHosting, SSL and support — 1 year\nTraining for the site administrator',
      modules:
        'Discovery — meeting with the administration, structure and content\nDesign — a mockup in the school’s brand style\n' +
        'Development — website, admin panel, courses section\nLaunch — content migration, training, handover of access',
    },
  },
  'Python для школьников': {
    kk: {
      title: 'Оқушыларға арналған Python',
      tagline: 'Түсінікті тапсырмалар арқылы нөлден бағдарламалау: ойындар, чат-боттар және деректерді талдау.',
      audience: '7–9-сынып',
      duration: '34 сабақ · 1 оқу жылы',
      format: 'Бетпе-бет немесе онлайн',
      price_note: 'мектепке лицензия / жыл',
      description:
        'Курс информатикадағы бағдарламалау бөлімін толық қамтиды және одан да кеңірек: оқушылар шағын ойындар, ' +
        'Telegram-бот және деректерді талдауға арналған қарапайым бағдарламалар жазады.\n\n' +
        'Тапсырмаларды автоматты тексеру мұғалімнің үй жұмыстарын тексеруге кететін уақытын үнемдейді.',
      features:
        'Презентациялары мен конспектілері бар 34 сабақ\nАвтотексерісі бар 200+ тапсырма\nБақылау жұмыстары және қорытынды жоба\n' +
        'Мұғалімге арналған әдістемелік нұсқаулық',
      modules:
        'Негіздер — айнымалылар, енгізу-шығару, шарттар\nЦиклдер мен функциялар — алғашқы ойынды жазамыз\n' +
        'Тізімдер мен жолдар — деректерді өңдеу\nЖоба — таңдау бойынша Telegram-бот немесе шағын ойын',
    },
    en: {
      title: 'Python for school students',
      tagline: 'Programming from scratch through relatable tasks: games, chatbots and data analysis.',
      audience: 'Grades 7–9',
      duration: '34 lessons · 1 school year',
      format: 'In person or online',
      price_note: 'school license / year',
      description:
        'The course covers the programming part of the computer science curriculum and goes beyond it: students write ' +
        'small games, a Telegram bot and simple data analysis programs.\n\n' +
        'Automatic grading saves teachers time on checking homework.',
      features: '34 lessons with slides and notes\n200+ auto-graded problems\nTests and a final project\nTeacher’s guide',
      modules:
        'Basics — variables, input/output, conditions\nLoops and functions — writing the first game\n' +
        'Lists and strings — processing data\nProject — a Telegram bot or a mini-game of your choice',
    },
  },
  'Программа кружка «3D-моделирование и печать»': {
    kk: {
      title: '«3D-модельдеу және басып шығару» үйірмесінің бағдарламасы',
      tagline: 'Үйірмеге немесе сабақтан тыс іс-әрекетке арналған дайын жұмыс бағдарламасы: алғашқы эскизден басылған модельге дейін.',
      audience: '6–11-сынып',
      duration: '72 сағат',
      format: 'Үйірме / сабақтан тыс іс-әрекет',
      price_note: 'мерзімсіз',
      description:
        '3D-модельдеу үйірмесін осы оқу жылында-ақ ашуға арналған құжаттар мен материалдар жинағы.\n\n' +
        'Тегін бағдарламаларда (Tinkercad, Blender) жұмыс істейміз, сондықтан лицензия сатып алудың қажеті жоқ.',
      features:
        'Жұмыс бағдарламасы және күнтізбелік-тақырыптық жоспар\n72 сағатқа арналған сабақ әзірлемелері\n' +
        'Оқу модельдерінің кітапханасы\n3D-принтер мен пластик таңдау бойынша ұсыныстар',
      modules:
        'Танысу — интерфейс және қарапайым фигуралар\nМодельдеу — күрделі пішіндер мен құрастырулар\n' +
        'Басып шығару — слайсер, баптаулар, өңдеу\nЖоба — мектепке немесе қалаға арналған модель',
    },
    en: {
      title: '“3D Modeling and Printing” club program',
      tagline: 'A ready-made program for a club or extracurricular activity: from the first sketch to a printed model.',
      audience: 'Grades 6–11',
      duration: '72 hours',
      format: 'Club / extracurricular',
      price_note: 'perpetual',
      description:
        'A package of documents and materials to open a 3D modeling club this school year.\n\n' +
        'We work in free software (Tinkercad, Blender), so there are no licenses to buy.',
      features:
        'Curriculum and lesson-by-lesson schedule\nLesson materials for 72 hours\n' +
        'A library of training models\nTips on choosing a 3D printer and filament',
      modules:
        'Introduction — interface and simple shapes\nModeling — complex shapes and assemblies\n' +
        'Printing — slicer, settings, post-processing\nProject — a model for the school or the city',
    },
  },
  'Лаборатория IoT: умная школа': {
    kk: {
      title: 'IoT зертханасы: ақылды мектеп',
      tagline: 'Заттар интернеті бойынша жобалық курс: оқушылар датчиктер құрастырып, мектеп деректерін дашбордқа шығарады.',
      audience: '8–11-сынып',
      duration: '36 сағат',
      format: 'Командалық жобалық жұмыс',
      price_note: 'мектепке лицензия / жыл',
      description:
        'Оқушылар «ақылды мектеп» жүйесін жобалайды: сыныптардағы температура мен CO₂ деңгейін, жарықтандыруды, ' +
        'асханадағы шуды өлшеп, деректерді ортақ онлайн-дашбордқа шығарады.\n\n' +
        'Курс ғылыми-практикалық конференциялар мен жобалар байқауларына өте қолайлы.',
      features:
        '36 сағаттық жобалық сабақтар\nESP32 үшін сызбалар мен код\nМектепке арналған дайын бұлттық дашборд\nЖоба қорғау үлгілері',
      modules:
        'Электроника — датчиктер, қуат, дәнекерлеу\nESP32 — Wi-Fi және деректерді жіберу\n' +
        'Дашборд — графиктер мен хабарландырулар\nҚорғау — жобаның презентациясы',
    },
    en: {
      title: 'IoT Lab: Smart School',
      tagline: 'A project-based Internet of Things course: students build sensors and stream school data to a dashboard.',
      audience: 'Grades 8–11',
      duration: '36 hours',
      format: 'Team project work',
      price_note: 'school license / year',
      description:
        'Students design a “smart school” system: they measure temperature and CO₂ in classrooms, lighting and noise ' +
        'in the cafeteria — and display the data on a shared online dashboard.\n\n' +
        'The course is a great fit for science fairs and project competitions.',
      features:
        '36 hours of project sessions\nSchematics and code for ESP32\nA ready-made cloud dashboard for the school\nProject presentation templates',
      modules:
        'Electronics — sensors, power, soldering\nESP32 — Wi-Fi and sending data\n' +
        'Dashboard — charts and notifications\nPresentation — defending the project',
    },
  },
  'Онлайн-тренажёр по алгоритмам': {
    kk: {
      title: 'Алгоритмдер бойынша онлайн-тренажёр',
      tagline: 'Автотексерісі және сынып рейтингі бар тапсырмалар — сабаққа, үй жұмысына және олимпиадаға дайындалуға.',
      audience: '5–11-сынып',
      duration: 'Жазылым',
      format: 'Онлайн, браузерде',
      price_note: 'мектепке айына',
      description:
        'Мұғалім сынып құрып, тапсырмалар топтамасын береді және әр оқушының үлгерімін көреді. ' +
        'Тапсырмалар тақырыптар мен күрделілік деңгейлеріне бөлінген — алғашқы циклдерден олимпиадалық есептерге дейін.',
      features:
        'Автотексерісі бар 1000+ тапсырма\nСыныптар, топтамалар және мерзімдер\nОқушылар бойынша рейтинг пен статистика\nPython, C++, Pascal',
    },
    en: {
      title: 'Online algorithms trainer',
      tagline: 'Auto-graded problems with a class leaderboard — for lessons, homework and olympiad preparation.',
      audience: 'Grades 5–11',
      duration: 'Subscription',
      format: 'Online, in the browser',
      price_note: 'per month per school',
      description:
        'A teacher creates a class, assigns problem sets and sees each student’s progress. ' +
        'Problems are organized by topic and difficulty — from the first loops to olympiad level.',
      features:
        '1000+ auto-graded problems\nClasses, problem sets and deadlines\nLeaderboard and per-student statistics\nPython, C++, Pascal',
    },
  },
};

const hasTranslations = (value) => Object.keys(parseTranslations(value)).length > 0;

/**
 * Один раз добавляет переводы к стартовым категориям и демо-разработкам,
 * созданным до появления языков. Уже переведённое или изменённое в админке не трогаем.
 */
async function backfillTranslations(store) {
  if (await store.getMeta('i18n_seeded')) return;
  await store.setMeta('i18n_seeded', '1');
  const defaults = Object.fromEntries(CATEGORIES.map((c) => [c.slug, c]));
  for (const c of await store.listCategories({ publishedCounts: false })) {
    const tr = CATEGORY_TRANSLATIONS[c.slug];
    if (tr && defaults[c.slug].name === c.name && !hasTranslations(c.translations)) {
      await store.setCategoryTranslations(c.id, JSON.stringify(tr));
    }
  }
  for (const p of await store.listDemoProducts()) {
    const tr = PRODUCT_TRANSLATIONS[p.title];
    if (tr && !hasTranslations(p.translations)) await store.updateProduct(p.id, { translations: JSON.stringify(tr) });
  }
}

async function seedDemoProducts(store) {
  if (await store.getMeta('demo_seeded')) return;
  await store.setMeta('demo_seeded', '1');
  if ((await store.countProducts()).total > 0) return;

  const categories = await store.listCategories({ publishedCounts: false });
  const bySlug = Object.fromEntries(categories.map((c) => [c.slug, c.id]));
  for (const [i, p] of PRODUCTS.entries()) {
    const { category, ...rest } = p;
    await store.createProduct({
      ...rest,
      tags: normalizeTags(rest.tags),
      category_id: bySlug[category] ?? null,
      status: 'published',
      sort_order: (i + 1) * 10,
      is_demo: true,
      translations: JSON.stringify(PRODUCT_TRANSLATIONS[p.title] || {}),
    });
  }
}

export async function seedDatabase(store, { demo = true } = {}) {
  if ((await store.listCategories({ publishedCounts: false })).length === 0) {
    for (const [i, c] of CATEGORIES.entries()) {
      await store.createCategory({
        ...c,
        sort_order: (i + 1) * 10,
        translations: JSON.stringify(CATEGORY_TRANSLATIONS[c.slug] || {}),
      });
    }
  }
  if (demo) await seedDemoProducts(store);
  await backfillTranslations(store);
}
