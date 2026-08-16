import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/tools/quickStats.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/tools/quickStats.js')>();
  return { ...actual, quickStats: vi.fn() };
});

import { quickStats } from '../../src/tools/quickStats.js';
import {
  chainCompareRegions,
  chainRegionBrief,
  hasExactValue,
  isExactGeography,
} from '../../src/tools/chains.js';
import { classifyDistrictRowName } from '../../src/tools/quickRank.js';
import { explainStatisticSchema } from '../../src/tools/explainStatistic.js';

const mockedQuickStats = vi.mocked(quickStats);

function result(
  keyword: string,
  requested: string,
  actual: string,
  match: 'exact' | 'parent' | 'national-reference',
  value = '10'
) {
  return {
    success: true,
    answer: `${actual} ${keyword} ${value}`,
    value,
    unit: keyword === '의사수' ? '명' : '건',
    period: '2025년',
    metric: {
      keyword,
      label: keyword === '의사수' ? '의료기관 종사 의사수' : `${keyword} 실제 항목`,
      unit: keyword === '의사수' ? '명' : '건',
    },
    geography: {
      requested,
      actual,
      requestedLevel: 'district' as const,
      actualLevel: match === 'exact' ? ('district' as const) : ('province' as const),
      match,
    },
    source: {
      orgId: '101',
      tableId: `TABLE_${keyword}`,
      tableName: `${keyword} 표`,
      itemId: `ITEM_${keyword}`,
    },
  };
}

describe('지역 브리핑 정확성', () => {
  beforeEach(() => mockedQuickStats.mockReset());

  it('상위지역 참고값을 직접값 성공률에서 제외하고 별도 표시한다', async () => {
    mockedQuickStats.mockImplementation(async ({ query, region }) =>
      query === '인구'
        ? result(query, region!, region!, 'exact', '649715')
        : result(query, region!, '서울', 'parent')
    );

    const brief = await chainRegionBrief({
      region: '송파구',
      includeNational: false,
      format: 'detail',
    });

    expect(brief.coverage).toBe('1/13 지표 조회 성공');
    expect(brief.references).toHaveLength(12);
    if (!('summary' in brief)) throw new Error('detail 응답에 summary가 없습니다.');
    expect(brief.summary).toContain('요청 지역 직접값이 아니어서 가용 건수에서 제외');
    expect(brief.summary).not.toContain('13/13');
  });

  it('고정 라벨 대신 실제 조회 항목명을 사용한다', async () => {
    mockedQuickStats.mockImplementation(async ({ query, region }) =>
      result(query, region!, region!, 'exact')
    );

    const brief = await chainRegionBrief({
      region: '송파구',
      includeNational: false,
      format: 'detail',
    });
    const doctors = brief.indicators.find((indicator) => indicator.keyword === '의사수');

    expect(doctors?.label).toBe('의료기관 종사 의사수');
    expect(doctors?.source).toMatchObject({
      tableId: 'TABLE_의사수',
      itemId: 'ITEM_의사수',
    });
  });
});

describe('다지역 비교 정확성', () => {
  beforeEach(() => mockedQuickStats.mockReset());

  it('상위지역 참고값을 순위에서 제외한다', async () => {
    mockedQuickStats.mockImplementation(async ({ query, region }) =>
      region === '송파구'
        ? result(query, region, '서울', 'parent', '100')
        : result(query, region!, region!, 'exact', '50')
    );

    const compared = await chainCompareRegions({
      regions: ['송파구', '강남구'],
      keywords: ['GRDP'],
    });

    expect(compared.insights[0].ranking).toHaveLength(1);
    expect(compared.insights[0].ranking[0].region).toBe('강남구');
    expect(compared.fallbackNotes).toEqual([
      expect.objectContaining({ region: '송파구' }),
    ]);
  });
});

describe('지역 메타데이터·순위 비교집단', () => {
  it('직접값과 참고값을 구분한다', () => {
    expect(isExactGeography(result('인구', '송파구', '송파구', 'exact'))).toBe(true);
    expect(isExactGeography(result('GRDP', '송파구', '서울', 'parent'))).toBe(false);
    expect(hasExactValue({ success: true, answer: '표만 조회됨' })).toBe(false);
  });

  it('시·군·자치구·일반구를 분리한다', () => {
    expect(classifyDistrictRowName('서울 송파구')).toBe('autonomous-gu');
    expect(classifyDistrictRowName('청주시 상당구')).toBe('general-gu');
    expect(classifyDistrictRowName('수원시')).toBe('si');
    expect(classifyDistrictRowName('양평군')).toBe('gun');
    expect(classifyDistrictRowName('가상구')).toBe('unknown-gu');
  });
});

describe('각주 입력 계약', () => {
  it('quick_stats source 객체 전체를 그대로 받을 수 있다', () => {
    const parsed = explainStatisticSchema.inputSchema.parse({
      keyword: '출산율',
      region: '송파구',
      source: {
        orgId: '101',
        tableId: 'DT_1B81A23',
        tableName: '합계출산율',
        itemId: 'T2',
      },
    });

    expect(parsed.source?.tableId).toBe('DT_1B81A23');
    expect(parsed.source?.itemId).toBe('T2');
  });
});
