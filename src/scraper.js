const { chromium } = require("playwright");

const BASE_URL = "https://starto.jp";
const LIST_URL =
    `${BASE_URL}/s/p/media/list?tag=42&list[]=42&artist=42`;

/**
 * 取得対象カテゴリ
 *
 * CONCERT は意図的に除外する。
 * 既存のカテゴリ構成を維持する。
 */
const categories = [
    "TV",
    "RADIO",
    "MAGAZINE",
    "WEB",
    "RELEASE",
    "STAGE",
    "EVENT",
    "TICKET",
    "MOVIE"
];

/**
 * SixTONESのメンバー
 */
const sixtonesMembers = [
    "ジェシー",
    "京本大我",
    "松村北斗",
    "髙地優吾",
    "森本慎太郎",
    "田中樹",
    "SixTONES"
];

/**
 * SixTONESのスケジュールを取得する
 *
 * STARTOのスケジュールAPIからデータを取得する。
 * ページ本文全体の解析は行わない。
 *
 * @param {string} month 取得対象年月（YYYYMM）
 * @returns {Promise<Array<{
 *   date: string,
 *   category: string,
 *   time: string|null,
 *   title: string,
 *   station: string|null,
 *   members: string[]
 * }>>}
 */
async function scrapeSixTONES(month) {
    if (!/^\d{6}$/.test(month)) {
        throw new Error(
            `年月の形式が不正です: ${month}（YYYYMM形式で指定してください）`
        );
    }

    const year = Number(month.slice(0, 4));
    const monthNumber = Number(month.slice(4, 6));

    if (
        monthNumber < 1 ||
        monthNumber > 12 ||
        year < 1900
    ) {
        throw new Error(
            `年月の値が不正です: ${month}`
        );
    }

    const browser = await chromium.launch({
        headless: true
    });

    try {
        const context = await browser.newContext({
            locale: "ja-JP",
            javaScriptEnabled: true,
            serviceWorkers: "block"
        });

        const page = await context.newPage();

        console.log(
            `STARTOスケジュール取得開始: ${month}`
        );

        /*
         * STARTOのドメインを開き、
         * 同一オリジンのAPIを呼び出せる状態にする。
         *
         * 月移動ボタンによる画面操作には依存しない。
         */
        await page.goto(LIST_URL, {
            waitUntil: "domcontentloaded",
            timeout: 60000
        });

        /*
         * 対象月のAPIを直接呼び出す。
         *
         * media:
         *   TV、RADIO、MAGAZINE、WEBなどの情報
         *
         * titl:
         *   ディスコグラフィーなどの発売情報
         *
         * live:
         *   CONCERT情報を含むため、今回の取得対象から除外する。
         */
        const apiData = await fetchScheduleApi(
            page,
            month
        );

        console.log(
            `API取得件数 (${month}):`,
            {
                media: apiData.media.length,
                titles: apiData.titles.length
            }
        );

        /*
         * media APIの結果を既存のスケジュール形式に変換する。
         */
        const mediaSchedules = apiData.media
            .map(item => convertMediaItem(item, month))
            .filter(Boolean);

        /*
         * titl APIの結果をRELEASEとして変換する。
         *
         * titl APIでは catename が OTHER になっている
         * 発売情報もあるため、発売情報として扱う。
         */
        const releaseSchedules = apiData.titles
            .map(item => convertTitleItem(item, month))
            .filter(Boolean);

        /*
         * 結果を統合する。
         */
        const schedules = [
            ...mediaSchedules,
            ...releaseSchedules
        ];

        /*
         * 同一予定の重複を除去する。
         */
        const uniqueSchedules = removeDuplicates(
            schedules
        );

        /*
         * 日付順に並べる。
         */
        uniqueSchedules.sort((a, b) => {
            const dateComparison =
                a.date.localeCompare(b.date);

            if (dateComparison !== 0) {
                return dateComparison;
            }

            const categoryComparison =
                a.category.localeCompare(b.category);

            if (categoryComparison !== 0) {
                return categoryComparison;
            }

            return a.title.localeCompare(b.title);
        });

        /*
         * 取得対象月以外のデータが混入していないか確認する。
         */
        const expectedPrefix =
            `${month.slice(0, 4)}-${month.slice(4, 6)}-`;

        const invalidSchedules = uniqueSchedules.filter(
            item =>
                typeof item.date !== "string" ||
                !item.date.startsWith(expectedPrefix)
        );

        if (invalidSchedules.length > 0) {
            console.error(
                "対象月以外のデータを検出しました:",
                invalidSchedules
            );

            throw new Error(
                `${month}以外の日付が含まれています`
            );
        }

        console.log(
            `スケジュール取得完了 (${month}):`,
            {
                count: uniqueSchedules.length,
                schedules: uniqueSchedules
            }
        );

        return uniqueSchedules;
    } finally {
        await browser.close();
    }
}

/**
 * STARTOのスケジュールAPIを呼び出す
 *
 * @param {import("playwright").Page} page
 * @param {string} month YYYYMM
 * @returns {Promise<{media: Array, titles: Array}>}
 */
async function fetchScheduleApi(page, month) {
    const result = await page.evaluate(
        async ({ month }) => {
            const query =
                `dy=${encodeURIComponent(month)}` +
                `&list%5B%5D=42` +
                `&list%5B%5D=42` +
                `&rw=3000`;

            const endpoints = {
                media:
                    `/s/p/api/list/media?${query}`,

                titles:
                    `/s/p/api/list/titl?${query}`
            };

            async function fetchJson(url) {
                const response = await fetch(url, {
                    method: "GET",
                    credentials: "same-origin",
                    headers: {
                        Accept: "application/json"
                    }
                });

                if (!response.ok) {
                    throw new Error(
                        `APIリクエストに失敗しました: ` +
                        `status=${response.status}, url=${url}`
                    );
                }

                return response.json();
            }

            const [mediaResponse, titleResponse] =
                await Promise.all([
                    fetchJson(endpoints.media),
                    fetchJson(endpoints.titles)
                ]);

            if (
                !mediaResponse ||
                !Array.isArray(mediaResponse.items)
            ) {
                throw new Error(
                    "media APIのレスポンス形式が不正です"
                );
            }

            if (
                !titleResponse ||
                !Array.isArray(titleResponse.items)
            ) {
                throw new Error(
                    "titl APIのレスポンス形式が不正です"
                );
            }

            return {
                media: mediaResponse.items,
                titles: titleResponse.items
            };
        },
        { month }
    );

    return result;
}

/**
 * media APIのデータを既存形式に変換する
 *
 * @param {Object} item
 * @param {string} month YYYYMM
 * @returns {Object|null}
 */
function convertMediaItem(item, month) {
    if (!item || typeof item !== "object") {
        return null;
    }

    const category = normalizeCategory(
        item.catename
    );

    /*
     * 許可されていないカテゴリは取得しない。
     * CONCERTもここで除外される。
     */
    if (!category) {
        return null;
    }

    const date = normalizeDate(
        item.date_base ||
        item.date ||
        ""
    );

    if (!isTargetMonth(date, month)) {
        return null;
    }

    const title = normalizeText(item.name);

    if (!title) {
        return null;
    }

    const members = extractMembers(
        item.tags_display,
        item.custom_artist_name
    );

    /*
     * SixTONESまたはメンバーとの関連を
     * APIの出演者情報から確認できない予定は登録しない。
     */
    if (members.length === 0) {
        return null;
    }

    const time = normalizeTime(item.time);

    const titleInfo = extractStation(title);

    return {
        date,
        category,
        time,
        title: titleInfo.title,
        station: titleInfo.station,
        members
    };
}

/**
 * titl APIのデータをRELEASE形式に変換する
 *
 * @param {Object} item
 * @param {string} month YYYYMM
 * @returns {Object|null}
 */
function convertTitleItem(item, month) {
    if (!item || typeof item !== "object") {
        return null;
    }

    /*
     * titl APIの発売日は str_titlrday に格納される。
     */
    const date = normalizeDate(
        item.str_titlrday ||
        item.date_base ||
        item.date ||
        ""
    );

    if (!isTargetMonth(date, month)) {
        return null;
    }

    const title = normalizeText(item.name);

    if (!title) {
        return null;
    }

    const members = extractMembers(
        item.tags_display,
        item.custom_artist_name
    );

    /*
     * SixTONESまたはメンバーとの関連を
     * 出演者情報から確認できない発売情報は除外する。
     */
    if (members.length === 0) {
        return null;
    }

    const titleInfo = extractStation(title);

    return {
        date,
        category: "RELEASE",
        time: null,
        title: titleInfo.title,
        station: titleInfo.station,
        members
    };
}

/**
 * APIのカテゴリ名を正規化する
 *
 * @param {string} value
 * @returns {string|null}
 */
function normalizeCategory(value) {
    if (typeof value !== "string") {
        return null;
    }

    const category = value.trim().toUpperCase();

    if (!categories.includes(category)) {
        return null;
    }

    return category;
}

/**
 * 日付をYYYY-MM-DD形式に変換する
 *
 * 対応例:
 *   2026/12/07
 *   2026-12-07
 *
 * @param {string} value
 * @returns {string|null}
 */
function normalizeDate(value) {
    if (typeof value !== "string") {
        return null;
    }

    const match = value.trim().match(
        /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/
    );

    if (!match) {
        return null;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    const date = new Date(
        Date.UTC(year, month - 1, day)
    );

    /*
     * 2026/02/31などの不正な日付を除外する。
     */
    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() + 1 !== month ||
        date.getUTCDate() !== day
    ) {
        return null;
    }

    return (
        `${String(year).padStart(4, "0")}-` +
        `${String(month).padStart(2, "0")}-` +
        `${String(day).padStart(2, "0")}`
    );
}

/**
 * 対象月の日付か確認する
 *
 * @param {string|null} date YYYY-MM-DD
 * @param {string} month YYYYMM
 * @returns {boolean}
 */
function isTargetMonth(date, month) {
    if (!date) {
        return false;
    }

    const expectedPrefix =
        `${month.slice(0, 4)}-${month.slice(4, 6)}-`;

    return date.startsWith(expectedPrefix);
}

/**
 * 時刻を正規化する
 *
 * 例:
 *   22:00- -> 22:00
 *   05:50- -> 05:50
 *
 * @param {string|null|undefined} value
 * @returns {string|null}
 */
function normalizeTime(value) {
    if (
        typeof value !== "string" ||
        value.trim() === ""
    ) {
        return null;
    }

    const time = value.trim();

    const match = time.match(
        /^(\d{1,2}:\d{2})(?:[-−ー])?$/
    );

    if (match) {
        return match[1];
    }

    return time;
}

/**
 * APIの出演者情報からSixTONESメンバーを抽出する
 *
 * tags_displayには、出演者情報を表すJSON文字列が
 * 連結された形式で格納される場合がある。
 *
 * JSON全体を単一のJSONとして解析せず、
 * 文字列中のメンバー名を確認する。
 *
 * @param {...(string|null|undefined)} values
 * @returns {string[]}
 */
function extractMembers(...values) {
    const source = values
        .filter(value => typeof value === "string")
        .join("\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/&nbsp;/gi, " ");

    const members = sixtonesMembers.filter(
        member => source.includes(member)
    );

    return [...new Set(members)];
}

/**
 * タイトルと局名などを分離する
 *
 * 例:
 *   番組名 (日本テレビ系)
 *
 *   title: 番組名
 *   station: 日本テレビ系
 *
 * 末尾の括弧だけを分離対象とする。
 *
 * @param {string} value
 * @returns {{title: string, station: string|null}}
 */
function extractStation(value) {
    const title = normalizeText(value);

    const match = title.match(
        /^(.+?)\s*\(([^()]*)\)$/
    );

    if (!match) {
        return {
            title,
            station: null
        };
    }

    return {
        title: match[1].trim(),
        station: match[2].trim() || null
    };
}

/**
 * 文字列を正規化する
 *
 * @param {unknown} value
 * @returns {string}
 */
function normalizeText(value) {
    if (typeof value !== "string") {
        return "";
    }

    return value
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * 重複予定を除去する
 *
 * 日付・カテゴリ・時刻・タイトルを基準にする。
 * 同じ予定が複数回取得された場合は1件にまとめる。
 *
 * @param {Array<Object>} schedules
 * @returns {Array<Object>}
 */
function removeDuplicates(schedules) {
    const result = new Map();

    for (const schedule of schedules) {
        const key = [
            schedule.date,
            schedule.category,
            schedule.time || "",
            schedule.title
        ].join("_");

        const existing = result.get(key);

        if (!existing) {
            result.set(key, {
                ...schedule,
                members: [...schedule.members]
            });

            continue;
        }

        /*
         * 同一予定に複数の出演者情報がある場合は統合する。
         */
        existing.members = [
            ...new Set([
                ...existing.members,
                ...schedule.members
            ])
        ];
    }

    return [...result.values()];
}
module.exports = scrapeSixTONES;