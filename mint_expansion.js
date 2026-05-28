// Mint Museum expansion — merges into MINT_DATA in app_v2.js (load after app_v2.js)

const MINT_EXPANSION = {
    israel: {
        he: {
            history: [
                {
                    title: 'מפעל הטביעה בירושלים (1962)',
                    text: 'בשנת 1962 הוקם מפעל הטביעה של ICMC בירושלים, והחברה החלה לייצר מטבעות בארץ לראשונה. המעבר איפשר ייצור מקומי של מטבעות זיכרון ומדליות מכסף וזהב תחת בקרת איכות ישירה. המפעל משלב טכנולוגיות הטבעה מתקדמות עם עיצוב אמנותי ישראלי. כיום הוא מייצר אלפי מטבעות כסף טהור מדי שנה לשוק המקומי והבינלאומי.'
                },
                {
                    title: 'סדרות שקל ומורשת מקראית בכסף',
                    text: 'ICMC מנפיקה סדרות כסף על נושאים תנ״כיים והיסטוריים — שקל, חנוכה, פסח ומלכי ישראל. מטבעות אלה מוטבעים בדרך כלל מכסף 999, ולעיתים 925 בסטרלינג. הסדרות מוגבלות בטירז׳ ונחשבות לפריטי אספנות עם פרמיה מעל ערך המתכת. עיצובים מבוססי ממצאים ארכיאולוגיים מישראל מוסיפים ערך היסטורי לכל אונקיה.'
                },
                {
                    title: 'מיקום בשוק הכסף הפיזי הישראלי',
                    text: 'בישראל, ICMC (המכונה גם The Holy Land Mint) היא המקור הממשלתי המוביל למטבעות כסף פיזי מוסמכים. משקיעים ישראלים רוכשים מטבעותיה לרוב עם פרמיה של 15%–25% מעל מחיר הספוט. המטבעות נמכרים בקלות יחסית בשוק המקומי בזכות המוניטין והעיצוב הלאומי. חשוב לשמור חשבוניות לצורכי מס רווח הון בעת מכירה.'
                }
            ],
            records: [
                { title: 'נוסדה 1952', text: 'הוקמה כחברה ממשלתית מטעם בנק ישראל — שלוש שנים לאחר הקמת המדינה.' },
                { title: '60+ מדינות', text: 'מטבעות ICMC מופצים ביותר מ-60 מדינות ברחבי העולם.' },
                { title: 'מפעל ירושלים 1962', text: 'מאז 1962 מייצרת החברה מטבעות במפעל מקומי בירושלים.' },
                { title: 'כסף 999 ו-925', text: 'מייצרת מטבעות השקעה ואספנות בטוהר 999, ומדליות סטרלינג 925.' },
                { title: 'יונת השלום 2014', text: 'בוליון הדגל "יונת השלום" — כסף 999 מ-2014, וזהב 999.9 מ-2019, בראונדים ומטילים.' },
            ]
        },
        en: {
            history: [
                {
                    title: 'Jerusalem Minting Facility (1962)',
                    text: 'In 1962, ICMC established its minting plant in Jerusalem and began producing coins domestically for the first time. The move enabled local manufacture of commemorative coins and medals in silver and gold under direct quality control. The facility combines advanced striking technology with Israeli artistic design. Today it produces thousands of fine silver coins annually for domestic and international markets.'
                },
                {
                    title: 'Shekel & Biblical Silver Series',
                    text: 'ICMC issues silver series on biblical and historical themes — Shekel, Hanukkah, Passover, and Kings of Israel. These coins are typically struck in .999 fine silver, sometimes in .925 sterling for medals. Limited mintages make them collectibles often trading above melt value. Designs based on Israeli archaeological finds add historical depth to every troy ounce.'
                },
                {
                    title: "Role in Israel's Physical Silver Market",
                    text: 'In Israel, ICMC (also known as The Holy Land Mint) is the leading government-backed source for certified physical silver coins. Israeli investors typically buy its products at premiums of roughly 15%–25% above spot. Coins resell relatively easily in the local market thanks to national branding and trust. Keeping purchase receipts is essential for capital-gains reporting when selling.'
                }
            ],
            records: [
                { title: 'Founded 1952', text: 'Established as a government corporation under the Bank of Israel, three years after independence.' },
                { title: '60+ Countries', text: 'ICMC coins are distributed in more than 60 countries worldwide.' },
                { title: 'Jerusalem Plant 1962', text: 'Has minted coins at its Jerusalem facility since 1962.' },
                { title: '.999 & .925 Silver', text: 'Produces investment and collector pieces in .999 fine and .925 sterling silver.' },
                { title: 'Dove of Peace 2014', text: 'Flagship "Dove of Peace" bullion — .999 silver since 2014, .9999 gold since 2019, in rounds and bars.' },
            ]
        },
        ru: {
            history: [
                {
                    title: 'Монетный завод в Иерусалиме (1962)',
                    text: 'В 1962 году ICMC открыла чеканный завод в Иерусалиме и впервые начала производить монеты внутри страны. Это позволило выпускать памятные монеты и медали из серебра и золота под прямым контролем качества. Предприятие сочетает современные технологии чеканки с израильским художественным дизайном. Сегодня ежегодно производятся тысячи монет из чистого серебра для местного и мирового рынка.'
                },
                {
                    title: 'Серии «Шекель» и библейское наследие',
                    text: 'ICMC выпускает серебряные серии на библейские и исторические темы — Шекель, Ханука, Пасха и «Цари Израиля». Монеты обычно чеканятся из серебра .999, медали иногда из серебра 925 пробы. Ограниченные тиражи делают их коллекционными предметами с надбавкой выше стоимости металла. Дизайны, основанные на археологических находках Израиля, добавляют историческую ценность каждой унции.'
                },
                {
                    title: 'Место на рынке физического серебра Израиля',
                    text: 'В Израиле ICMC (также Holy Land Mint) — ведущий государственный источник сертифицированных серебряных монет. Инвесторы обычно покупают её продукцию с надбавкой около 15%–25% к спотовой цене. Монеты относительно легко перепродаются на местном рынке благодаря национальному бренду. Сохраняйте чеки покупки для налоговой отчётности при продаже.'
                }
            ],
            records: [
                { title: 'Основана в 1952', text: 'Создана как государственная корпорация при Банке Израиля через три года после независимости.' },
                { title: '60+ стран', text: 'Монеты ICMC распространяются более чем в 60 странах мира.' },
                { title: 'Завод в Иерусалиме 1962', text: 'С 1962 года чеканит монеты на заводе в Иерусалиме.' },
                { title: 'Серебро 999 и 925', text: 'Выпускает инвестиционные и коллекционные изделия из серебра .999 и .925.' },
                { title: '«Голубь мира» 2014', text: 'Флагманский буллион «Голубь мира» — серебро 999 с 2014, золото 999.9 с 2019, монеты и слитки.' }
            ]
        }
    },

    germany: {
        he: {
            history: [
                {
                    title: 'מורשת הטאלר והסחר בכסף בווארי',
                    text: 'בית המטבע הבוורי שימש במשך מאות שנים לייצור טאלרים כספיים — מטבעות שהפכו לתקן סחר אירופי. בוואריה הייתה מרכז כלכלי חשוב באימפריה, והכסף שוטבע במינכן זרם לכל אירופה. מטבעות עתיקים עם סימן "D" (Drechsler/München) נחשבים היום לפריטי אספנות יקרים. המורשת הזו ממשיכה בסדרות כסף מודרניות כמו "Deutschland Silber Unze".'
                },
                {
                    title: 'תוכנית מטבעות הזיכרון בכסף של גרמניה',
                    text: 'גרמניה מנפיקה מטבעות זיכרון רשמיים בכסף 925 ו-999 במסגרת סדרות כמו "גרמניה יפה" (10 יורו) ו"16 מדינות" (20 יורו). כל מטבע מכיל כמות מתכת ידועה — לרוב 16–32 גרם כסף טהור. משקיעים אירופיים רוכשים אותם לעיתים מתחת לפרמיה של מטבעות בוליון קלאסיים, אך עם ערך אספנותי נוסף. בית המטבע הבוורי (סימן D) הוא אחד משמונה בתי מטבע פעילים בגרמניה.'
                },
                {
                    title: 'דיוק טביעה ואיכות גרמנית',
                    text: 'בתי המטבע הגרמניים ידועים בדיוק הטביעה הגבוה ובסטנדרטים קפדניים של משקל וטוהר. מטילי כסף בווריים ומטבעות זיכרון עוברים בקרת איכות לפני יציאה לשוק. גרמניה היא גם מרכז עיבוד ומסחר במתכות יקרות באירופה, עם קשר הדוק לתקני LBMA. עבור משקיעי כסף פיזי, המוצרים הגרמניים מציעים שילוב של מורשת, אמינות ועיצוב.'
                }
            ],
            records: [
                { title: 'נוסד 1158', text: 'אחד מבתי המטבע הפעילים הוותיקים בעולם — ייסוד על ידי הנסיך הנריך האריה במינכן.' },
                { title: 'סימן מטבע D', text: 'כל מטבע ממינכן נושא את סימן המטבע "D" — מזהה בינלאומי לבוואריה.' },
                { title: '8 בתי מטבע בגרמניה', text: 'גרמניה מפעילה שמונה בתי מטבע ממשלתיים; בוואריה היא הגדול והמוכר ביותר.' },
                { title: '850+ שנות פעילות', text: 'חגג 850 שנה לייסוד ב-2008 — רצף ייצור מטבעות נדיר בהיסטוריה.' },
                { title: 'סדרת Deutschland Silber Unze', text: 'סדרת אונקיית כסף גרמנית פופולרית בקרב משקיעי כסף פיזי באירופה.' }
            ]
        },
        en: {
            history: [
                {
                    title: 'Thaler Legacy & Bavarian Silver Trade',
                    text: 'The Bavarian Mint served for centuries as a producer of silver Thalers — coins that became a European trade standard. Bavaria was an economic hub of the Empire, and silver struck in Munich circulated across the continent. Ancient coins bearing the "D" mintmark (Munich) are prized collectibles today. That heritage continues in modern silver series such as the "Deutschland Silber Unze."'
                },
                {
                    title: "Germany's Official Silver Commemorative Program",
                    text: 'Germany issues official commemorative coins in .925 and .999 silver through series like "Beautiful Germany" (€10) and "16 States" (€20). Each coin contains a defined silver weight — typically 16–32 grams of fine silver. European investors sometimes acquire them at lower premiums than classic bullion, with added numismatic value. The Bavarian Mint (mintmark D) is one of eight active German mints.'
                },
                {
                    title: 'Strike Precision & German Quality Standards',
                    text: 'German mints are renowned for high strike precision and strict weight and fineness standards. Bavarian silver bars and commemorative coins undergo quality control before market release. Germany is also a major European precious-metals processing hub with close ties to LBMA standards. For physical silver investors, German products combine heritage, reliability, and design.'
                }
            ],
            records: [
                { title: 'Founded 1158', text: 'One of the oldest continuously operating mints in the world — established by Henry the Lion in Munich.' },
                { title: 'Mintmark "D"', text: 'Every Munich-struck coin bears the "D" mintmark — an international identifier for Bavaria.' },
                { title: '8 German State Mints', text: 'Germany operates eight government mints; Bavaria is the largest and best known.' },
                { title: '850+ Years of Operation', text: 'Celebrated 850 years since founding in 2008 — a rare continuity in minting history.' },
                { title: 'Deutschland Silber Unze', text: 'Popular German silver-ounce series among European physical silver investors.' }
            ]
        },
        ru: {
            history: [
                {
                    title: 'Наследие талера и баварской торговли серебром',
                    text: 'Баварский монетный двор веками чеканил серебряные талеры — монеты, ставшие европейским торговым стандартом. Бавария была экономическим центром империи, и серебро из Мюнхена циркулировало по всей Европе. Древние монеты с клеймом «D» (Мюнхен) сегодня ценятся коллекционерами. Это наследие продолжается в современных сериях, таких как «Deutschland Silber Unze».'
                },
                {
                    title: 'Программа памятных серебряных монет Германии',
                    text: 'Германия выпускает официальные памятные монеты из серебра .925 и .999 в сериях «Красивая Германия» (10 евро) и «16 земель» (20 евро). Каждая монета содержит определённое количество чистого серебра — обычно 16–32 грамма. Европейские инвесторы иногда покупают их с меньшей надбавкой, чем классический буллион, с добавленной нумизматической ценностью. Баварский двор (клеймо D) — один из восьми действующих.'
                },
                {
                    title: 'Точность чеканки и немецкие стандарты',
                    text: 'Немецкие монетные дворы известны высокой точностью чеканки и строгими стандартами веса и пробы. Баварские слитки и памятные монеты проходят контроль качества перед выпуском. Германия — крупный европейский центр обработки драгоценных металлов со связями со стандартами LBMA. Для инвесторов в физическое серебро немецкая продукция сочетает наследие, надёжность и дизайн.'
                }
            ],
            records: [
                { title: 'Основан в 1158', text: 'Один из старейших действующих монетных дворов мира — основан Генрихом Львом в Мюнхене.' },
                { title: 'Клеймо «D»', text: 'Каждая монета из Мюнхена несёт клеймо «D» — международный идентификатор Баварии.' },
                { title: '8 монетных дворов Германии', text: 'В Германии действуют восемь государственных дворов; Баварский — крупнейший и известнейший.' },
                { title: '850+ лет работы', text: 'В 2008 году отметил 850-летие основания — редкая непрерывность в истории чеканки.' },
                { title: 'Серия Deutschland Silber Unze', text: 'Популярная немецкая серия серебряных унций среди европейских инвесторов.' }
            ]
        }
    },

    uk: {
        he: {
            history: [
                {
                    title: 'כסף בריטי לפני הברבריאניה',
                    text: 'לפני השקת מטבע הברבריאניה ב-1987, המינט המלכותי ייצר מטבעות כסף היסטוריים כמו Crown ומטבעות .500 (50% כסף) עד 1946. מטבעות כסף ותיקים נחשבים היום לפריטי אספנות עם ערך מעל המתכת. המעבר לכסף 999.9 בברבריאניה סימן שינוי בשוק ההשקעות הבריטי. משקיעים מחפשים לעיתים מטבעות Elizabeth II ו-Charles III כנקודות מעבר היסטוריות.'
                },
                {
                    title: 'לנטריסנט — מפעל המטבעות הגדול בעולם',
                    text: 'מאז 1968, המינט המלכותי פועל בלנטריסנט, ויילס — אחד ממפעלי הטבעה הגדולים והמתקדמים בעולם. המתקן מייצר מיליארדי מטבעות מחוספסים בשנה לצד מטבעות כסף וזהב פרמיום. קווי ייצור אוטומטיים מאפשרים דיוק במשקל של עד שברירי גרם לאונקיה. כמעט כל מטבע הברבריאניה והסדרות המיוחדות נטבעים כאן.'
                },
                {
                    title: 'סדרות כסף 2 אונקיות ושוק האספנות',
                    text: 'המינט המלכותי הוביל את שוק מטבעות הכסף בגודל 2 אונקיות — סדרת Queen\'s Beasts (2016–2021) כללה 10 מטבעות, כל אחד 62.2 גרם כסף 999.9. סדרות נוספות כוללות Shengxiao (לוח סיני) ומטבעות יובל מלכותי. מטבעות 2oz נפוצים בקרב "סטאקרים" שצוברים כסף פיזי במשקל גבוה יותר לאונקיה.'
                }
            ],
            records: [
                { title: 'נוסד 886 לספירה', text: 'מסורת טביעה רציפה של למעלה מ-1,100 שנה — החל מאלפרד הגדול.' },
                { title: 'ברבריאניה מ-1987', text: 'מטבע הכסף ההשקעה הבריטי המרכזי — כסף 999.9, הילך חוקי £2.' },
                { title: '999.9 — ארבעה תשעות', text: 'ברבריאניה בין המטבעות הטהורים ביותר בשוק הבוליון העולמי.' },
                { title: 'מעבר ללנטריסנט 1968', text: 'עבר ממגדל לונדון למתקן מודרני בוויילס — ייצור בקנה מידה עולמי.' },
                { title: 'Queen\'s Beasts — 10 מטבעות', text: 'סדרת 2016–2021: 10×2oz כסף, כ-622 גרם כסף טהור בסט מלא.' }
            ]
        },
        en: {
            history: [
                {
                    title: 'British Silver Before Britannia',
                    text: 'Before the Britannia bullion coin launched in 1987, the Royal Mint produced historic silver such as Crowns and .500 fine (50% silver) coins until 1946. Vintage British silver is now valued as collectibles often above melt. The shift to .9999 fine Britannia marked a new era in UK investment silver. Investors seek Elizabeth II and Charles III issues as historical transition pieces.'
                },
                {
                    title: 'Llantrisant — One of the World\'s Largest Mints',
                    text: 'Since 1968, the Royal Mint has operated at Llantrisant, Wales — among the largest and most advanced coin factories globally. The site strikes billions of circulation coins annually alongside premium silver and gold. Automated lines achieve weight precision to fractions of a gram per troy ounce. Nearly all Britannias and special silver series are struck here.'
                },
                {
                    title: '2oz Silver Series & the Stacking Market',
                    text: 'The Royal Mint pioneered the popular 2oz silver format — the Queen\'s Beasts series (2016–2021) comprised ten coins, each 62.2g of .9999 silver. Other series include the Shengxiao lunar line and royal jubilee issues. Two-ounce coins are favoured by stackers accumulating more silver weight per piece than standard 1oz bullion.'
                }
            ],
            records: [
                { title: 'Founded 886 AD', text: 'Over 1,100 years of continuous minting tradition — from Alfred the Great onward.' },
                { title: 'Britannia Since 1987', text: 'The UK\'s flagship silver bullion coin — .9999 fine, £2 legal tender face value.' },
                { title: 'Four-Nines Fineness', text: 'Britannia ranks among the purest mainstream bullion coins on the global market.' },
                { title: 'Llantrisant Since 1968', text: 'Moved from the Tower of London to a world-scale facility in Wales.' },
                { title: "Queen's Beasts — 10 Coins", text: '2016–2021 series: ten 2oz silver coins, ~622g of fine silver in a full set.' }
            ]
        },
        ru: {
            history: [
                {
                    title: 'Британское серебро до Britannia',
                    text: 'До запуска инвестиционной Britannia в 1987 году Королевский двор чеканил историческое серебро — кроны и монеты из серебра .500 (50%) до 1946 года. Винтажное британское серебро ценится коллекционерами выше стоимости металла. Переход к серебру .9999 ознаменовал новую эру инвестиций в Великобритании. Инвесторы ищут монеты Елизаветы II и Карла III как исторические переходные выпуски.'
                },
                {
                    title: 'Лланттресант — один из крупнейших дворов мира',
                    text: 'С 1968 года Королевский монетный двор работает в Лланттресанте, Уэльс — одном из крупнейших и самых современных монетных заводов в мире. Ежегодно чеканятся миллиарды монет для обращения наряду с премиальным серебром и золотом. Автоматизированные линии обеспечивают точность веса до долей грамма на унцию. Здесь чеканятся почти все Britannia и специальные серебряные серии.'
                },
                {
                    title: 'Серебро 2 унции и рынок стекинга',
                    text: 'Королевский двор популяризировал формат 2 унций — серия «Звери королевы» (2016–2021) включала 10 монет по 62,2 г серебра .9999 каждая. Другие серии — лунный Shengxiao и юбилейные монархические выпуски. Монеты 2 унций популярны у «стекеров», накапливающих больше серебра на монету, чем стандартная 1 унция.'
                }
            ],
            records: [
                { title: 'Основан в 886 г. н.э.', text: 'Более 1100 лет непрерывной традиции чеканки — с времён Альфреда Великого.' },
                { title: 'Britannia с 1987', text: 'Главная британская инвестиционная монета — серебро .9999, номинал £2.' },
                { title: 'Проба «четыре девятки»', text: 'Britannia входит в число самых чистых буллион-монет мирового рынка.' },
                { title: 'Лланттресант с 1968', text: 'Переезд из Тауэра в современный завод в Уэльсе мирового масштаба.' },
                { title: '«Звери королевы» — 10 монет', text: 'Серия 2016–2021: десять монет по 2 унции, ~622 г чистого серебра в полном наборе.' }
            ]
        }
    },

    usa: {
        he: {
            history: [
                {
                    title: 'ארבעה מיתקני מטבע פעילים',
                    text: 'בית המטבע האמריקאי מפעיל מיתקנים בפילדלפיה, דנבר, סן פרנסיסקו ו-West Point. מטבעות בוליון Silver Eagle נטבעים בעיקר ב-West Point (סימן W) וסן פרנסיסקו (S). סימני מטבע (P, D, S, W) מוסיפים ערך אספנותי למהדורות Proof. משקיעים בודקים את סימן המטבע בעת רכישת מטבעות ישנים או מיוחדים.'
                },
                {
                    title: 'דולר כסף קלאסי (1878–1935)',
                    text: 'לפני ה-Silver Eagle, דולר הכסף Morgan (1878–1904, 1921) ו-Peace Dollar (1921–1935) היו עמודי התווך של הכסף האמריקאי. מטבעות אלו מכילים 90% כסף (0.7734 אונקיה טהורה למטבע). ב-2021 הוצאו מהדורות מחודשות ב-999 טהור — 175,000 יחידות לכל מיתקן. שוק האספנות האמריקאי נשען על מורשת דולרים אלו.'
                },
                {
                    title: 'West Point ואספקת כסף לאומית',
                    text: 'מיתקן West Point בניו יורק מייצר את American Silver Eagle ושומר על מלאי אסטרטגי של כסף וזהב אמריקאי. המתקן הוקם במקור כמחסן זהב ב-1937 והפך למיתקן מטבע מלא ב-1988. כמות הכסף הפיזי שעובר דרך West Point משפיעה על אמון השוק האמריקאי. Monster Box רשמי של 500 אונקיות הוא יחידת הרכישה הסטנדרטית לסיטונאים.'
                }
            ],
            records: [
                { title: 'נוסד 1792', text: 'מוסד בפילדלפיה — בניין המטבע הפדרלי הציבורי הראשון בארה"ב.' },
                { title: '500+ מיליון Silver Eagles', text: 'נמכרו יותר מ-500 מיליון American Silver Eagle מאז 1986 — המטבע הנמכר ביותר בעולם.' },
                { title: 'Monster Box — 500oz', text: 'ארגז רשמי: 25 צינורות × 20 מטבעות = 500 אונקיות כסף טהור.' },
                { title: 'כסף 999 מאז 1986', text: 'Silver Eagle: 31.103 גרם כסף 999 לכל מטבע, הילך חוקי $1.' },
                { title: '5 מיתקנים היסטוריים', text: 'כולל קרסו, ניו אורלינס ודאלס — סימני P, D, S, W, O מזוהים ע"י אספנים.' }
            ]
        },
        en: {
            history: [
                {
                    title: 'Four Active Mint Facilities',
                    text: 'The US Mint operates facilities in Philadelphia, Denver, San Francisco, and West Point. Bullion Silver Eagles are primarily struck at West Point (W) and San Francisco (S). Mintmarks (P, D, S, W) add numismatic premium to Proof issues. Investors verify mintmarks when buying vintage or special-edition coins.'
                },
                {
                    title: 'Classic Silver Dollars (1878–1935)',
                    text: 'Before the Silver Eagle, the Morgan Dollar (1878–1904, 1921) and Peace Dollar (1921–1935) anchored American silver. These coins contain 90% silver (0.7734 troy oz fine per coin). In 2021, redesigned .999 fine versions were issued — 175,000 per mint facility. The US numismatic market is built on this dollar heritage.'
                },
                {
                    title: 'West Point & National Silver Supply',
                    text: 'West Point, New York produces the American Silver Eagle and holds US strategic silver and gold stockpiles. The site began as a gold bullion depository in 1937 and became a full mint in 1988. Physical silver flowing through West Point underpins American market confidence. The official 500-oz Monster Box is the standard wholesale unit.'
                }
            ],
            records: [
                { title: 'Founded 1792', text: 'Established in Philadelphia — the first federal public building in the United States.' },
                { title: '500+ Million Silver Eagles', text: 'Over 500 million American Silver Eagles sold since 1986 — world\'s best-selling bullion coin.' },
                { title: 'Monster Box — 500 oz', text: 'Official case: 25 tubes × 20 coins = 500 troy ounces of fine silver.' },
                { title: '.999 Silver Since 1986', text: 'Silver Eagle: 31.103g of .999 fine silver per coin, $1 legal tender face value.' },
                { title: '5 Historic Mintmarks', text: 'Including Carson City, New Orleans, and Dahlonega — P, D, S, W, O recognized by collectors.' }
            ]
        },
        ru: {
            history: [
                {
                    title: 'Четыре действующих монетных двора',
                    text: 'Монетный двор США управляет предприятиями в Филадельфии, Денвере, Сан-Франциско и Вест-Пойнте. Буллион Silver Eagle чеканятся в основном в Вест-Пойнте (W) и Сан-Франциско (S). Клейма (P, D, S, W) добавляют нумизматическую ценность к Proof-выпускам. Инвесторы проверяют клеймо при покупке старых или специальных монет.'
                },
                {
                    title: 'Классические серебряные доллары (1878–1935)',
                    text: 'До Silver Eagle серебряный доллар Morgan (1878–1904, 1921) и Peace Dollar (1921–1935) были основой американского серебра. Монеты содержат 90% серебра (0,7734 тройской унции чистого серебра). В 2021 году выпущены обновлённые версии .999 — по 175 000 с каждого двора. Американский рынок нумизматики построен на этом наследии.'
                },
                {
                    title: 'Вест-Пойнт и национальные запасы серебра',
                    text: 'Вест-Пойнт, Нью-Йорк, производит American Silver Eagle и хранит стратегические запасы серебра и золота США. Объект начинался как золотое хранилище в 1937 году и стал полноценным двором в 1988. Серебро, проходящее через Вест-Пойнт, поддерживает доверие рынка. Официальный Monster Box на 500 унций — стандартная оптовая единица.'
                }
            ],
            records: [
                { title: 'Основан в 1792', text: 'Создан в Филадельфии — первое федеральное общественное здание США.' },
                { title: '500+ млн Silver Eagles', text: 'Продано более 500 миллионов American Silver Eagle с 1986 — самая продаваемая буллион-монета.' },
                { title: 'Monster Box — 500 унций', text: 'Официальная упаковка: 25 тюбиков × 20 монет = 500 тройских унций чистого серебра.' },
                { title: 'Серебро .999 с 1986', text: 'Silver Eagle: 31,103 г серебра .999 на монету, номинал $1.' },
                { title: '5 исторических клейм', text: 'Включая Карсон-Сити, Новый Орлеан и Далонегу — P, D, S, W, O узнаваемы коллекционерами.' }
            ]
        }
    },

    canada: {
        he: {
            history: [
                {
                    title: 'מפעל ויניפג לבוליון כסף',
                    text: 'ב-1988 נפתח מפעל בית המטבע בויניפג, מניטובה, ייעודי לייצור מטבעות בוליון בקנה מידה גדול. בעוד שאוטווה מתמקדת במטבעות אספנות, ויניפג מייצרת את רוב מטבעות Maple Leaf הכספיים. המיקום המרכזי מאפשר הפצה יעילה לשוק האמריקאי והגלובלי. משקיעים מחפשים מטבעות עם סימן W (Winnipeg) על מהדורות מיוחדות.'
                },
                {
                    title: 'חדשנות אבטחה — קווים רадиальיים',
                    text: 'מ-2015, מטבעות Maple Leaf כסף כוללים טכנולוגיית קווים רадиальיים מיקרו-מחוררים למניעת זיוף. ב-2014 נוספו הולוגרמות על גב המטבע. קנדה הייתה בין הראשונות להטמיע אמצעי אבטחה פיזיים על מטבעות בוליון. עבור משקיעים, שכבות האבטחה מפחיתות סיכון קניית כסף מזויף.'
                },
                {
                    title: 'מורשת כריית הכסף הקנדי',
                    text: 'קנדה הייתה במשך עשורים מפיקת הכסף הגדולה בעולם — מכרות בקומבלק, אונטריו ובריטיש קולומביה אספקו עשרות מיליוני אונקיות. בית המטבע ממחזר ומעבד כסף ממקורות מקומיים לייצור מטבעות ומטילים. קשר הדוק בין כרייה, היתוך וטביעה מחזק את אמינות המותג הקנדי בשוק הכסף הפיזי.'
                }
            ],
            records: [
                { title: 'נוסד 1908', text: 'בית המטבע המלכותי הקנדי — עצמאות מוניטרית מבריטניה.' },
                { title: '9999 — 99.99% טוהר', text: 'Silver Maple Leaf: אחד ממטבעות הבוליון הטהורים ביותר בשוק.' },
                { title: 'מפעל ויניפג 1988', text: 'מייצר את עיקר מטבעות הבוליון הכספיים לשוק העולמי.' },
                { title: 'מטבע 100 ק"ג זהב 2007', text: 'הנפיק את המטבע החוקי הגדול בעולם — 100 ק"ג זהב 99999 (שיא גינס).' },
                { title: 'אבטחה מ-2015', text: 'קווים רדיאליים מיקרו על Maple Leaf — חדשנות נגד זיוף.' }
            ]
        },
        en: {
            history: [
                {
                    title: 'Winnipeg Bullion Facility',
                    text: 'In 1988, the Royal Canadian Mint opened its Winnipeg, Manitoba plant dedicated to large-scale bullion production. While Ottawa focuses on collector coins, Winnipeg strikes most silver Maple Leaf coins. The central location enables efficient distribution to US and global markets. Collectors seek coins with the W (Winnipeg) mintmark on special issues.'
                },
                {
                    title: 'Security Innovation — Radial Lines',
                    text: 'Since 2015, silver Maple Leaf coins feature micro-engraved radial lines to deter counterfeiting. In 2014, holograms were added to the reverse. Canada was among the first to embed physical security features on bullion coins. For investors, these layers reduce the risk of buying fake silver.'
                },
                {
                    title: 'Canadian Silver Mining Heritage',
                    text: 'For decades Canada ranked among the world\'s largest silver producers — mines in Quebec, Ontario, and British Columbia supplied tens of millions of ounces. The Mint refines and processes domestic silver for coins and bars. The link between mining, refining, and striking strengthens the Canadian brand in physical silver markets.'
                }
            ],
            records: [
                { title: 'Founded 1908', text: 'Royal Canadian Mint — Canada\'s monetary independence from Britain.' },
                { title: '.9999 — 99.99% Pure', text: 'Silver Maple Leaf: among the purest mainstream bullion coins available.' },
                { title: 'Winnipeg Plant 1988', text: 'Produces the bulk of silver bullion coins for world markets.' },
                { title: '100kg Gold Coin 2007', text: 'Issued the world\'s largest legal-tender coin — 100kg of .99999 gold (Guinness record).' },
                { title: 'Security Since 2015', text: 'Micro radial lines on Maple Leaf — pioneering anti-counterfeit bullion tech.' }
            ]
        },
        ru: {
            history: [
                {
                    title: 'Завод в Виннипеге для буллиона',
                    text: 'В 1988 году Королевский монетный двор открыл завод в Виннипеге, Манитоба, для крупномасштабного производства буллиона. Оттава выпускает коллекционные монеты, Виннипег чеканит большинство серебряных Maple Leaf. Центральное расположение обеспечивает поставки на рынки США и мира. Коллекционеры ищут монеты с клеймом W (Виннипег) на специальных выпусках.'
                },
                {
                    title: 'Инновации безопасности — радиальные линии',
                    text: 'С 2015 года серебряные Maple Leaf имеют микрогравированные радиальные линии против подделок. В 2014 году на реверс добавили голограммы. Канада была среди первых, кто внедрил физические защитные элементы на буллион. Для инвесторов это снижает риск покупки поддельного серебра.'
                },
                {
                    title: 'Наследие канадской добычи серебра',
                    text: 'Десятилетиями Канада входила в крупнейшие производители серебра — шахты в Квебеке, Онтарио и Британской Колумбии давали десятки миллионов унций. Двор перерабатывает местное серебро для монет и слитков. Связь добычи, плавки и чеканки укрепляет канадский бренд на рынке физического серебра.'
                }
            ],
            records: [
                { title: 'Основан в 1908', text: 'Королевский монетный двор Канады — монетарная независимость от Британии.' },
                { title: 'Проба .9999', text: 'Silver Maple Leaf — одна из самых чистых буллион-монет на рынке.' },
                { title: 'Завод Виннипега 1988', text: 'Производит основную массу серебряных буллион-монет для мирового рынка.' },
                { title: 'Золотая монета 100 кг 2007', text: 'Выпустил крупнейшую законное платёжное средство — 100 кг золота .99999 (рекорд Гиннесса).' },
                { title: 'Защита с 2015', text: 'Микрорадиальные линии на Maple Leaf — новаторская антиподделочная технология.' }
            ]
        }
    },

    perth: {
        he: {
            history: [
                {
                    title: 'עיבוד וזיקוק כסף בקנה מידה עולמי',
                    text: 'Perth Mint הוא גם מפעל זיקוק מוביל — מעבד מאות טונות זהב וכסף מדי שנה, כולל סורבים ממכרות אוסטרליה. מטילי כסף Perth נושאים מספר סידורי ואימות הולוגרפי. משקיעים ברחבי אסיה רוכשים מטילים אלה כסטנדרט אמינות. הזיקוק המקומי מבטיח מעקב מלא מכרייה ועד מוצר סופי.'
                },
                {
                    title: 'תוכנית Kookaburra — עיצוב שנתי',
                    text: 'מ-1990, סדרת Silver Kookaburra מציגה עיצוב קוקאברה חדש מדי שנה — חדשנות שיצרה שוק אספנות עצום. מטבעות 1oz ו-2oz (Proof) נחשבים לנדירים לאחר סגירת השנה. אספנים עוקבים אחר תאריכי הוצאה כדי לרכוש בפרמיה נמוכה יותר. הסדרה הוכיחה שמטבעות כסף פיזיים יכולים להיות גם השקעה וגם תחביב.'
                },
                {
                    title: 'אחסון מוקצה (Allocated Storage)',
                    text: 'Perth Mint מציעה שירות אחסון מוקצה — כסף פיזי רשום על שם המשקיע בכספת המינט. זה מפחית סיכון צד נגדי לעומת חשבונות לא מוקצים. תוכניות Certificate וDepository פופולריות במיוחד באסיה. עבור משקיעים שלא רוצים אחסון ביתי, זהו פתרון ממשלתי ישיר לכסף פיזי.'
                }
            ],
            records: [
                { title: 'נוסד 1899', text: 'נוסד בזהב האוסטרלי — סניף לשעבר של המינט המלכותי הבריטי.' },
                { title: '99999 — Five Nines', text: 'מייצר כסף בטוהר 99.999% — מהגבוהים בעולם.' },
                { title: 'Kookaburra מ-1990', text: 'סדרת כסף עם עיצוב משתנה שנתית — חלוצה עולמית.' },
                { title: '400+ טון זהב בשנה', text: 'מעבד למעלה מ-400 טון זהב מדי שנה — מפעל זיקוק ענק.' },
                { title: 'Lunar Series מ-1999', text: '12 מטבעות לוח שנה סיני — מהסדרות הנמכרות ביותר באסיה.' }
            ]
        },
        en: {
            history: [
                {
                    title: 'Global-Scale Silver Refining',
                    text: 'Perth Mint is also a leading refinery — processing hundreds of tonnes of gold and silver annually, including scrap from Australian mines. Perth silver bars carry serial numbers and holographic authentication. Investors across Asia buy these bars as a trust standard. Local refining ensures full traceability from mine to finished product.'
                },
                {
                    title: 'Kookaburra Program — Annual Design Change',
                    text: 'Since 1990, the Silver Kookaburra series has featured a new kookaburra design each year — innovation that created a huge collector market. 1oz and 2oz Proof coins become scarce after the year closes. Collectors track release dates to buy at lower premiums. The series proved physical silver can be both investment and hobby.'
                },
                {
                    title: 'Allocated Storage Program',
                    text: 'Perth Mint offers allocated storage — physical silver recorded in the investor\'s name in the mint vault. This reduces counterparty risk versus unallocated accounts. Certificate and Depository programs are especially popular in Asia. For investors avoiding home storage, it is direct government-backed physical silver custody.'
                }
            ],
            records: [
                { title: 'Founded 1899', text: 'Established during the Australian gold rush — former branch of Britain\'s Royal Mint.' },
                { title: '.99999 — Five Nines', text: 'Produces silver at 99.999% fineness — among the highest in the world.' },
                { title: 'Kookaburra Since 1990', text: 'Silver series with annually changing design — a global pioneer.' },
                { title: '400+ Tonnes Gold/Year', text: 'Refines over 400 tonnes of gold annually — a major global refinery.' },
                { title: 'Lunar Series Since 1999', text: '12-coin Chinese zodiac series — among the best-selling in Asia.' }
            ]
        },
        ru: {
            history: [
                {
                    title: 'Мировая переработка серебра',
                    text: 'Монетный двор Перта — также крупный аффинажный завод, перерабатывающий сотни тонн золота и серебра ежегодно, включая лом австралийских шахт. Серебряные слитки Perth имеют серийный номер и голографическую защиту. Инвесторы по всей Азии покупают их как стандарт надёжности. Местная переработка обеспечивает прослеживаемость от шахты до готового продукта.'
                },
                {
                    title: 'Программа Kookaburra — ежегодный дизайн',
                    text: 'С 1990 года серия Silver Kookaburra каждый год получает новый дизайн кукабарры — инновация, создавшая огромный коллекционный рынок. Монеты 1 и 2 унций (Proof) становятся редкими после закрытия года. Коллекционеры отслеживают даты выпуска для покупки по меньшей надбавке. Серия доказала, что физическое серебро может быть и инвестицией, и хобби.'
                },
                {
                    title: 'Программа аллокированного хранения',
                    text: 'Perth Mint предлагает аллокированное хранение — физическое серебро, зарегистрированное на имя инвестора в хранилище двора. Это снижает контрагентский риск по сравнению с неаллокированными счетами. Программы Certificate и Depository особенно популярны в Азии. Для инвесторов без домашнего хранения — прямое государственное хранение серебра.'
                }
            ],
            records: [
                { title: 'Основан в 1899', text: 'Создан в эпоху золотой лихорадки — бывший филиал британского Королевского двора.' },
                { title: 'Проба .99999', text: 'Выпускает серебро 99,999% — одно из самых чистых в мире.' },
                { title: 'Kookaburra с 1990', text: 'Серебряная серия с ежегодно меняющимся дизайном — мировой новатор.' },
                { title: '400+ тонн золота в год', text: 'Перерабатывает более 400 тонн золота ежегодно — крупный аффинажный завод.' },
                { title: 'Lunar Series с 1999', text: '12 монет китайского зодиака — одни из самых продаваемых в Азии.' }
            ]
        }
    },

    austria: {
        he: {
            history: [
                {
                    title: 'כסף כופר ומקורות המימון (1194)',
                    text: 'בית המטבע הווינאי נוסד מכסף כופר ששולם על ידי ריצ\'רד לב הארי — 15 טון כסף לפי המסורת. הכסף הוטבע למטבעות תלמי ומטבעות אימפריה. מקורות המימון הקשורים לכסף פיזי מדגישים את הקשר בין ערך מלחמתי לערך מטבעי. כיום, Münze Österreich ממשיך מסורת של יותר מ-800 שנה.'
                },
                {
                    title: 'פילהרמוניקר — מכירות גלובליות',
                    text: 'מ-1989, Wiener Philharmoniker Silver הפך למטבע הבוליון הנמכר ביותר באירופה. המטבע מכיל בדיוק אונקיה טרוי (31.103 גרם) כסף 999. זמין בגדלים: 1oz, ½oz, ¼oz ו-10oz. עיצובו ללא תאריך — אותו עיצוב מ-1989. משקיעים באירופה רואים בו חלופה ישירה ל-Maple Leaf ו-Britannia.'
                },
                {
                    title: 'הילך חוקי בשני מטבעות',
                    text: 'Philharmoniker כסף הוא הילך חוקי ב-1.50 יורו (אונקיה) ו-0.50 יורו (¼oz) — נדיר בקרב מטבעות בוליון. ערך נקוב זה מעניק הגנה משפטית מסוימת, אם כי ערך השוק נקבע לפי כסף. בית המטבע מייצר גם מדליות כסף לאומות אחרות ושיתופי פעולה אמנותיים. איכות הטביעה האוסטרית נחשבת מהגבוהות בעולם.'
                }
            ],
            records: [
                { title: 'נוסד 1194', text: 'אחד מבתי המטבע הפעילים הוותיקים בעולם — מכסף כופר ריצ\'רד לב הארי.' },
                { title: 'Philharmoniker מ-1989', text: 'מטבע הכסף הנמכר ביותר באירופה — עיצוב קבוע של תזמורת וינה.' },
                { title: '31.103 גרם לאונקיה', text: 'כל מטבע 1oz מכיל בדיוק אונקיה טרוי כסף 999.' },
                { title: 'הילך 1.50 יורו', text: 'ערך נקוב חוקי על מטבע בוליון — מגן מסוים בהחזקה פיזית.' },
                { title: '800+ שנות פעילות', text: 'רצף ייצור מטבעות נדיר — משירות האימפריה ההבסבורגית ועד היום.' }
            ]
        },
        en: {
            history: [
                {
                    title: 'Ransom Silver & Mint Financing (1194)',
                    text: 'The Austrian Mint was founded from silver paid as ransom for Richard the Lionheart — traditionally 15 tonnes of silver. That silver was struck into coins for the realm. The physical-silver origins highlight the link between wartime value and monetary value. Today, Münze Österreich continues an 800+ year tradition.'
                },
                {
                    title: 'Philharmoniker — Global Sales Leader',
                    text: 'Since 1989, the Wiener Philharmoniker Silver has been Europe\'s best-selling bullion coin. Each contains exactly one troy ounce (31.103g) of .999 fine silver. Available in 1oz, ½oz, ¼oz, and 10oz sizes. Its design is dateless — unchanged since 1989. European investors treat it as a direct alternative to Maple Leaf and Britannia.'
                },
                {
                    title: 'Dual-Currency Legal Tender',
                    text: 'Silver Philharmoniker is legal tender at €1.50 (1oz) and €0.50 (¼oz) — rare among bullion coins. Face value offers limited legal protection, though market price follows silver content. The mint also strikes silver medals for other nations and artistic collaborations. Austrian strike quality ranks among the world\'s finest.'
                }
            ],
            records: [
                { title: 'Founded 1194', text: 'One of the oldest operating mints — financed by Richard the Lionheart\'s ransom silver.' },
                { title: 'Philharmoniker Since 1989', text: 'Europe\'s best-selling silver bullion coin — fixed Vienna Orchestra design.' },
                { title: '31.103g Per Ounce', text: 'Every 1oz coin contains exactly one troy ounce of .999 fine silver.' },
                { title: '€1.50 Face Value', text: 'Legal tender on bullion — limited protection for physical holders.' },
                { title: '800+ Years Operating', text: 'Rare minting continuity — from the Habsburg Empire to the present.' }
            ]
        },
        ru: {
            history: [
                {
                    title: 'Выкупное серебро и основание (1194)',
                    text: 'Австрийский монетный двор основан на серебре, выплаченном за выкуп Ричарда Львиное Сердце — по преданию 15 тонн. Серебро было перечеканено в монеты для государства. Происхождение из физического серебра подчёркивает связь военной и монетарной ценности. Сегодня Münze Österreich продолжает традицию более 800 лет.'
                },
                {
                    title: 'Philharmoniker — мировые продажи',
                    text: 'С 1989 года Wiener Philharmoniker Silver — самая продаваемая буллион-монета Европы. Содержит ровно одну тройскую унцию (31,103 г) серебра .999. Доступна в размерах 1, ½, ¼ и 10 унций. Дизайн без даты — неизменен с 1989 года. Европейские инвесторы считают её альтернативой Maple Leaf и Britannia.'
                },
                {
                    title: 'Двойной законный номинал',
                    text: 'Серебряный Philharmoniker — законное платёжное средство номиналом €1,50 (1 унция) и €0,50 (¼ унции) — редкость среди буллиона. Номинал даёт ограниченную правовую защиту, хотя рыночная цена следует за серебром. Двор также чеканит медали для других стран. Австрийское качество чеканки — одно из лучших в мире.'
                }
            ],
            records: [
                { title: 'Основан в 1194', text: 'Один из старейших дворов — на серебре выкупа Ричарда Львиное Сердце.' },
                { title: 'Philharmoniker с 1989', text: 'Самая продаваемая серебряная буллион-монета Европы — дизайн Венского оркестра.' },
                { title: '31,103 г на унцию', text: 'Каждая монета 1 унции содержит ровно одну тройскую унцию серебра .999.' },
                { title: 'Номинал €1,50', text: 'Законное платёжное средство на буллионе — ограниченная защита при хранении.' },
                { title: '800+ лет работы', text: 'Редкая непрерывность — от Габсбургской империи до наших дней.' }
            ]
        }
    },

    mexico: {
        he: {
            history: [
                {
                    title: 'ריאל ספרדי וכסף קולוניאלי',
                    text: 'בית המטבע המקסיקני (1535) הטביע את ה-Real de a Ocho — "דולר הספרדי" ששימש סחר עולמי. כסף ממכרות גואנחואטו וסקטקס אספק חלק עצום מהעולם. מטבעות אלו הפכו לבסיס למערכות מטבע באמריקה ואסיה. מורשת זו ממשיכה ב-Libertad כסף מודרני.'
                },
                {
                    title: 'אבולוציית עיצוב Libertad',
                    text: 'מ-1982, Onza de Plata Libertad מציגה את "הניצחון המכנף" (Angel of Independence) על רקע הרי הפופוקטפטל. ב-1996 עברה לטוהר 9999; ב-1991 נוספו גדלים מ-1/20oz עד 5oz. עיצוב ללא תאריך על פני המטבע — כמו Philharmoniker. Libertad נחשב לאחד המטבעות היפים ביותר בשוק הכסף.'
                },
                {
                    title: 'מתקן סן לואיס פוטוסי המודרני',
                    text: 'כיום בית המטבע פועל בעיקר בסן לואיס פוטוסי — מפעל מודרני לייצור מטבעות בוליון וזיכרון. הבניין ההיסטורי במקסיקו סיטי (מוזיאון, אתר מורשת UNESCO) מספר את סיפור 500 השנות כסף מקסיקני. מטבעות Libertad נמכרים בבנקים מקסיקניים ובשוק הבינלאומי. מקסיקו נותרה בין 10 המפיקים הגדולים של כסף בעולם.'
                }
            ],
            records: [
                { title: 'נוסד 1535', text: 'בית המטבע הוותיק ביותר באמריקה — כמעט 500 שנות פעילות.' },
                { title: 'Libertad מ-1982', text: 'מטבע הכסף ההשקעה הרשמי של מקסיקו — עיצוב Angel of Independence.' },
                { title: '5 גדלים', text: 'Libertad זמין מ-1/20oz עד 5oz — גמישות לכל תקציב.' },
                { title: 'UNESCO מורשת', text: 'הבניין ההיסטורי במקסיקו סיטי — אתר מורשת עולמית של אונסק"ו.' },
                { title: 'כסף 9999', text: 'גרסאות Libertad בטוהר 99.99% — בין הטהורים בשוק.' }
            ]
        },
        en: {
            history: [
                {
                    title: 'Spanish Real & Colonial Silver',
                    text: 'The Mexican Mint (1535) struck the Real de a Ocho — the "Spanish dollar" used in global trade. Silver from Guanajuato and Zacatecas mines supplied a huge share of world output. These coins underpinned monetary systems across the Americas and Asia. That legacy continues in the modern silver Libertad.'
                },
                {
                    title: 'Libertad Design Evolution',
                    text: 'Since 1982, the Onza de Plata Libertad has featured the Winged Victory (Angel of Independence) against the Popocatépetl mountains. In 1996 it moved to .9999 fineness; since 1991 sizes range from 1/20oz to 5oz. The obverse design is dateless — like the Philharmoniker. Libertad is widely considered among the most beautiful bullion coins.'
                },
                {
                    title: 'Modern San Luis Potosí Facility',
                    text: 'Today the mint operates mainly at San Luis Potosí — a modern plant for bullion and commemorative coins. The historic Mexico City building (museum, UNESCO World Heritage Site) tells 500 years of Mexican silver history. Libertad coins sell through Mexican banks and global dealers. Mexico remains among the world\'s top ten silver producers.'
                }
            ],
            records: [
                { title: 'Founded 1535', text: 'Oldest mint in the Americas — nearly 500 years of continuous operation.' },
                { title: 'Libertad Since 1982', text: 'Mexico\'s official silver investment coin — Angel of Independence design.' },
                { title: '5 Size Options', text: 'Libertad available from 1/20oz to 5oz — flexibility for every budget.' },
                { title: 'UNESCO Heritage', text: 'Historic Mexico City mint building — UNESCO World Heritage Site.' },
                { title: '.9999 Silver', text: 'Libertad issues in 99.99% fineness — among the purest on the market.' }
            ]
        },
        ru: {
            history: [
                {
                    title: 'Испанский реал и колониальное серебро',
                    text: 'Мексиканский монетный двор (1535) чеканил Real de a Ocho — «испанский доллар» мировой торговли. Серебро из шахт Гуанахуато и Сакатекас составляло огромную долю мирового производства. Эти монеты легли в основу денежных систем Америки и Азии. Наследие продолжается в современной серебряной Libertad.'
                },
                {
                    title: 'Эволюция дизайна Libertad',
                    text: 'С 1982 года Onza de Plata Libertad изображает «Крылатую победу» (Ангел Независимости) на фоне вулканов. В 1996 году проба повышена до .9999; с 1991 года размеры от 1/20 до 5 унций. Аверс без даты — как у Philharmoniker. Libertad считается одной из красивейших буллион-монет.'
                },
                {
                    title: 'Современный завод в Сан-Луис-Потоси',
                    text: 'Сегодня двор работает в основном в Сан-Луис-Потоси — современный завод буллиона и памятных монет. Историческое здание в Мехико (музей, объект ЮНЕСКО) рассказывает 500 лет мексиканского серебра. Libertad продаётся в мексиканских банках и у мировых дилеров. Мексика остаётся в десятке крупнейших производителей серебра.'
                }
            ],
            records: [
                { title: 'Основан в 1535', text: 'Старейший монетный двор Америки — почти 500 лет непрерывной работы.' },
                { title: 'Libertad с 1982', text: 'Официальная инвестиционная монета Мексики — дизайн Ангела Независимости.' },
                { title: '5 размеров', text: 'Libertad от 1/20 до 5 унций — гибкость для любого бюджета.' },
                { title: 'Наследие ЮНЕСКО', text: 'Историческое здание двора в Мехико — объект Всемирного наследия ЮНЕСКО.' },
                { title: 'Серебро .9999', text: 'Выпуски Libertad 99,99% пробы — среди самых чистых на рынке.' }
            ]
        }
    }
};

(function mergeMintExpansion() {
    for (const [id, langs] of Object.entries(MINT_EXPANSION)) {
        if (!MINT_DATA[id]) continue;
        for (const [lang, extra] of Object.entries(langs)) {
            const block = MINT_DATA[id][lang];
            if (!block) continue;
            if (extra.history?.length) block.history.push(...extra.history);
            if (extra.records?.length) block.records = extra.records;
        }
    }
})();
