const { validateData } = require('../path/to/your/validation/module');

test('取得件数0件', () => {
	expect(validateData([])).toBe('取得件数が0件です');
});

test('前回より件数が大幅減少', () => {
	const previousCount = 10;
	const currentCount = 2;
	expect(validateData(currentCount, previousCount)).toBe('前回より件数が大幅減少しています');
});

test('dateがnull', () => {
	const data = { date: null };
	expect(validateData(data)).toBe('dateがnullです');
});

test('titleがnull', () => {
	const data = { title: null };
	expect(validateData(data)).toBe('titleがnullです');
});

test('membersが空', () => {
	const data = { members: [] };
	expect(validateData(data)).toBe('membersが空です');
});

test('SixTONES重複', () => {
	const data = { members: ['SixTONES', 'SixTONES'] };
	expect(validateData(data)).toBe('SixTONESが重複しています');
});

test('同一レコード重複', () => {
	const data = [{ id: 1 }, { id: 1 }];
	expect(validateData(data)).toBe('同一レコードが重複しています');
});

test('station取得漏れ', () => {
	const data = { station: null };
	expect(validateData(data)).toBe('station取得漏れです');
});

test('time取得漏れ（TV・RADIOのみ）', () => {
	const data = { type: 'TV', time: null };
	expect(validateData(data)).toBe('time取得漏れです');
});

test('日付形式チェック', () => {
	const data = { date: '2023-02-30' };
	expect(validateData(data)).toBe('日付形式が不正です');
});

test('時刻形式チェック', () => {
	const data = { time: '25:00' };
	expect(validateData(data)).toBe('時刻形式が不正です');
});

test('カテゴリ不正', () => {
	const data = { category: '不正なカテゴリ' };
	expect(validateData(data)).toBe('カテゴリが不正です');
});