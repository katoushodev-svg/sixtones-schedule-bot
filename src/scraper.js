const { chromium } = require("playwright");

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

const sixtonesMembers = [
    "ジェシー",
    "京本大我",
    "松村北斗",
    "髙地優吾",
    "森本慎太郎",
    "田中樹",
    "SixTONES"
];

function createUrl() {
    return "https://starto.jp/s/p/media/list?tag=42&list[]=42&artist=42";
}

/**
 * 表示中の年月を取得する
 */
async function getDisplayedMonth(page) {
    const text = await page.locator("body").innerText();
    const months = text.match(/\d{4}\.\d{2}/g);

    if (!months) {
        return null;
    }
    // ページ内で重複している年月のうち、最初のものを採用する
    return months[0].replace(".", "");
}

/**
 * SixTONESのスケジュールを取得する
 *
 * @param {string} month 取得対象年月（YYYYMM）
 * @returns {Promise<Array>}
 */
async function scrapeSixTONES(month) {
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

        await page.goto(createUrl(), {
            waitUntil: "networkidle",
            timeout: 60000
        });

        // 初期画面の読み込みを待つ
        await page.waitForTimeout(3000);

        let currentMonth = await getDisplayedMonth(page);

        if (!currentMonth) {
            throw new Error("初期表示月を取得できません");
        }

        console.log(
            "現在:",
            currentMonth,
            "目的:",
            month
        );

        /**
         * 対象月まで次月ボタンで移動する
         */
        let count = 0;
        const maxAttempts = 12;

        while (currentMonth !== month) {
            count++;

            if (count > maxAttempts) {
                throw new Error(
                    `月移動が${maxAttempts}回を超えました: ` +
                    `現在=${currentMonth}, 対象=${month}`
                );
            }

            // 通常運用の対象月は当月以降だが、
            // 対象月が現在より前の場合は前月ボタンを使う
            const selector =
                currentMonth > month
                    ? ".c-pager__page.is-prev"
                    : ".c-pager__page.is-next";

            const pager = page.locator(selector);

            if (await pager.count() === 0) {
                throw new Error(
                    `月移動ボタンが見つかりません: ${selector}`
                );
            }

            const previousMonth = currentMonth;

            await pager.first().click({
                force: true,
                timeout: 10000
            });

            // カレンダーと予定一覧の更新を待つ
            await page.waitForTimeout(1000);
            await page.waitForTimeout(5000);

            const nextMonth = await getDisplayedMonth(page);

            console.log("月移動確認:", {
                previousMonth,
                targetMonth: month,
                detectedMonth: nextMonth
            });

            if (!nextMonth) {
                throw new Error("月移動後の表示月を取得できません");
            }

            if (nextMonth === previousMonth) {
                throw new Error(`月移動に失敗しました: ${previousMonth} → ${month}`);
            }

            currentMonth = nextMonth;

            console.log(
                "月移動:",
                previousMonth,
                "→",
                currentMonth
            );
        }

        // 取得対象月との一致を最終確認する
        if (currentMonth !== month) {
            throw new Error(
                `対象月が一致しません: ` +
                `表示=${currentMonth}, 対象=${month}`
            );
        }

        console.log("取得対象月:", currentMonth);

        // 予定一覧の描画を待つ
        await page.waitForTimeout(5000);

        const text = await page.locator("body").innerText();

        const schedules = parseSchedule(text, month);

        console.log(
            "取得ページ:",
            currentMonth,
            "件数:",
            schedules.length
        );

        return schedules;
    } finally {
        await browser.close();
    }
}

/**
 * ページ本文からスケジュールを解析する
 */
function parseSchedule(text, month) {
    let lines = text
        .split("\n")
        .map(value => value.trim())
        .filter(Boolean);

    const startIndex = lines.findIndex(
        value => /^\d{4}\.\d{2}$/.test(value)
    );

    if (startIndex === -1) {
        return [];
    }

    lines = lines.slice(startIndex);

    const results = [];
    let currentDate = null;

    const currentYearMonth =
        `${month.slice(0, 4)}-${month.slice(4)}`;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (isDateLine(lines, i)) {
            currentDate =
                `${currentYearMonth}-${line.padStart(2, "0")}`;

            continue;
        }

        if (!categories.includes(line)) {
            continue;
        }

        const category = line;

        let time = null;
        let title = null;
        let station = null;
        let members = [];

        let j = i + 1;

        while (
            j < lines.length &&
            !categories.includes(lines[j]) &&
            !isDateLine(lines, j)
        ) {
            const value = lines[j];

            // 時刻
            if (/^\d{1,2}:\d{2}[-−ー]?$/.test(value.trim())) {
                time = value.trim().replace("-", "");
                j++;
                continue;
            }

            // タイトル
            if (!title) {
                title = value;
                j++;
                continue;
            }

            // 出演者
            const matchedMembers = sixtonesMembers.filter(
                member => value.includes(member)
            );

            if (matchedMembers.length > 0) {
                members.push(...matchedMembers);

                // 重複を除去
                members = [...new Set(members)];

                // 出演者以降は注意書きのみのため、この予定の解析を終了
                break;
            }

            j++;
        }

        if (title && currentDate) {
            const match = title.match(/(.*?)\s*\((.*?)\)/);

            if (match) {
                title = match[1].trim();
                station = match[2].trim();
            }

            results.push({
                date: currentDate,
                category,
                time,
                title,
                station,
                members
            });
        }
    }

    return results;
}

/**
 * 日付行かどうかを判定する
 */
function isDateLine(lines, i) {
    return (
        /^\d{1,2}$/.test(lines[i]) &&
        /^\((SUN|MON|TUE|WED|THU|FRI|SAT)\)$/.test(lines[i + 1] ?? "")
    );
}
module.exports = scrapeSixTONES;