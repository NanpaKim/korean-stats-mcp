import { describe, expect, it, vi } from 'vitest';
import { quickRank } from '../../src/tools/quickRank.js';

const { getRows } = vi.hoisted(() => ({ getRows: vi.fn() }));
vi.mock('../../src/api/client.js', () => ({ getKosisClient: () => ({}) }));
vi.mock('../../src/cache/index.js', () => ({
  getCacheManager: () => ({ getStatisticsData: getRows }),
}));
vi.mock('../../src/utils/districtKosisCodes.js', () => ({
  getDistrictKscdCandidatesFor: async () => ['target'],
}));

function row(period: string, code: string, name: string, value: number) {
  return { PRD_DE: period, C1: code, C1_NM: name, DT: String(value) };
}

describe('시군구 순위', () => {
  const cities = Array.from({ length: 9 }, (_, index) =>
    row('2025', String(index), `지역${index}시`, index + 1)
  );

  it('동명 자치구의 값과 두 시점의 순위를 행정구역 코드로 찾는다', async () => {
    getRows.mockResolvedValueOnce([
      ...cities,
      row('2025', 'other', '중구', 90), row('2025', 'target', '중구', 10),
      row('2024', 'other', '중구', 10), row('2024', 'target', '중구', 90),
    ]);

    expect(await quickRank({ keyword: '출산율', region: '서울 중구' })).toMatchObject({
      success: true, value: 10, total: 2, rank: 2, rankChange: -1,
    });
  });

  it('전체 시군구로 비교할 때 직전 순위도 같은 범위로 계산한다', async () => {
    const latest = [...cities, row('2025', 'target', '광진구', 0)];
    getRows.mockResolvedValueOnce([...latest, ...latest.map((entry) => ({ ...entry, PRD_DE: '2024' }))]);

    expect(await quickRank({ keyword: '출산율', region: '광진구' })).toMatchObject({
      success: true, total: 10, rank: 10, rankChange: 0,
      comparisonGroup: { type: 'all-districts', included: 10 },
    });
  });
});
