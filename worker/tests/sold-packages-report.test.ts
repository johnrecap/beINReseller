import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    collectSuccessfulControls,
    type SuccessfulControl,
} from '../src/http/webforms-form';
import {
    parseSoldPackagesReportPage,
    scanSoldPackagesReport,
    validateSoldReportScan,
} from '../src/http/sold-packages-report';

const fixtureDirectory = join(
    process.cwd(),
    'worker',
    'tests',
    'fixtures',
    'sold-packages-report'
);

function fixture(name: string): string {
    return readFileSync(join(fixtureDirectory, name), 'utf8');
}

function controlValue(controls: readonly SuccessfulControl[], name: string): string | null {
    return controls.find((control) => control.name === name)?.value ?? null;
}

test('WebForms successful controls preserve split ViewState, duplicate names, and provider-selected dealer', () => {
    const controls = collectSuccessfulControls(fixture('initial-controls.html'), {
        activatedSubmitName: 'ctl00$ContentPlaceHolder1$btnApply',
    });

    assert.deepEqual(
        controls.map(({ name, value }) => [name, value]),
        [
            ['__EVENTTARGET', ''],
            ['__EVENTARGUMENT', ''],
            ['__VIEWSTATEFIELDCOUNT', '2'],
            ['__VIEWSTATE', 'view-state-part-0'],
            ['__VIEWSTATE1', 'view-state-part-1'],
            ['__VIEWSTATEGENERATOR', 'A1B2C3D4'],
            ['__EVENTVALIDATION', 'event-validation'],
            ['duplicateToken', 'first'],
            ['duplicateToken', 'second'],
            ['ctl00$ContentPlaceHolder1$ddlDealer', 'DEALER-001'],
            ['ctl00$ContentPlaceHolder1$ddlItemType', 'ALL'],
            ['ctl00$ContentPlaceHolder1$txtFromDate', '24/08/2026'],
            ['ctl00$ContentPlaceHolder1$txtToDate', '24/08/2026'],
            ['safeNote', ' synthetic note '],
            ['safeFlag', 'A'],
            ['ctl00$ContentPlaceHolder1$btnApply', 'Apply'],
        ]
    );
});

test('header-driven parsing returns only safe normalized report fields', () => {
    const parsed = parseSoldPackagesReportPage(fixture('report-page-reordered.html'));

    assert.equal(parsed.outcome, 'COMPLETE');
    assert.match(parsed.dealerContextHash ?? '', /^[a-f0-9]{64}$/);
    assert.equal(parsed.rows.length, 2);
    assert.equal(parsed.expectedTotalRows, 3);
    assert.equal(parsed.pagerComplete, true);
    assert.deepEqual(
        parsed.rows[0],
        {
            invoiceNo: '053000123',
            cardNumber: '7517687161',
            itemType: 'Card_CISCO',
            packageName: 'Add Premium 12 Months Save 25%',
            contractStartDate: '24/08/2026',
            contractExpiryDate: '23/08/2027',
            providerAmount: '1234.5',
            currency: 'USD',
            rowFingerprint: parsed.rows[0].rowFingerprint,
        }
    );
    assert.match(parsed.rows[0].rowFingerprint, /^[a-f0-9]{64}$/);
    assert.equal(parsed.rows[1].invoiceNo, '');
    assert.equal(parsed.rows[1].providerAmount, '87');

    const safeResult = JSON.stringify(parsed);
    assert.doesNotMatch(safeResult, /PRIVATE_SUBSCRIBER_SENTINEL|PRIVATE_COUNTRY_SENTINEL/);
    assert.doesNotMatch(safeResult, /page-one-view-state|page-one-event-validation/);
    assert.equal(Object.hasOwn(parsed.rows[0], 'subscriber'), false);
    assert.equal(Object.hasOwn(parsed.rows[0], 'country'), false);
    assert.equal(Object.hasOwn(parsed, 'rawHtml'), false);
});

test('valid empty report is complete evidence instead of a parse failure', () => {
    const parsed = parseSoldPackagesReportPage(fixture('report-empty.html'));

    assert.equal(parsed.outcome, 'COMPLETE');
    assert.match(parsed.dealerContextHash ?? '', /^[a-f0-9]{64}$/);
    assert.deepEqual(parsed.rows, []);
});

for (const scenario of [
    {
        name: 'login response',
        fixtureName: 'login-page.html',
        reasonCode: 'LOGIN_REQUIRED',
    },
    {
        name: 'missing report grid',
        fixtureName: 'missing-grid.html',
        reasonCode: 'MISSING_GRID',
    },
    {
        name: 'unexpected dealer group',
        fixtureName: 'report-aggregated.html',
        reasonCode: 'UNEXPECTED_DEALER_GROUP',
    },
] as const) {
    test(`${scenario.name} is incomplete rather than valid absence`, () => {
        const parsed = parseSoldPackagesReportPage(fixture(scenario.fixtureName));

        assert.equal(parsed.outcome, 'INCOMPLETE_SCAN');
        assert.equal(parsed.reasonCode, scenario.reasonCode);
        assert.deepEqual(parsed.rows, []);
    });
}

test('missing required grid headers is incomplete rather than valid absence', () => {
    const malformed = fixture('report-empty.html').replace('<th>Amount USD</th>', '<th>Unexpected</th>');
    const parsed = parseSoldPackagesReportPage(malformed);

    assert.equal(parsed.outcome, 'INCOMPLETE_SCAN');
    assert.equal(parsed.reasonCode, 'MISSING_REQUIRED_HEADERS');
});

test('pager controls are parsed as WebForms postback targets', () => {
    const parsed = parseSoldPackagesReportPage(fixture('report-page-reordered.html'));

    assert.equal(parsed.currentPage, 1);
    assert.deepEqual(parsed.pagerTargets, [
        {
            eventTarget: 'ctl00$ContentPlaceHolder1$GridView1',
            eventArgument: 'Page$2',
            pageNumber: 2,
        },
    ]);
});

test('unknown pager postbacks are incomplete evidence while Page$Last is understood but never skips pages', () => {
    const base = fixture('report-page-reordered.html');
    const unknown = parseSoldPackagesReportPage(base.replace('Page$2', 'Page$Mystery'));
    const withLast = parseSoldPackagesReportPage(base.replace(
        '</td>\n    </tr>\n  </table>',
        ' <a href="javascript:__doPostBack(\'ctl00$ContentPlaceHolder1$GridView1\',\'Page$Last\')">Last</a></td>\n    </tr>\n  </table>'
    ));

    assert.equal(unknown.outcome, 'COMPLETE');
    assert.equal(unknown.pagerComplete, false);
    assert.equal(withLast.pagerComplete, true);
    assert.deepEqual(withLast.pagerTargets.map((target) => target.pageNumber), [2]);

    const rejected = validateSoldReportScan({
        visitedPages: [unknown],
        firstPageRecheck: unknown,
    });
    assert.equal(rejected.outcome, 'INCOMPLETE_SCAN');
    assert.equal(rejected.reasonCode, 'UNKNOWN_PAGER_TARGET');
});

test('full scan preserves the selected dealer office, follows pages, and rechecks the first-page watermark', async () => {
    const history: string[] = [];
    const pageOne = fixture('report-page-reordered.html');
    const pageTwo = fixture('report-page-two.html');

    const result = await scanSoldPackagesReport({
        freshGet: async () => {
            history.push('GET');
            return fixture('initial-controls.html');
        },
        post: async (controls: readonly SuccessfulControl[]) => {
            const dealer = controlValue(controls, 'ctl00$ContentPlaceHolder1$ddlDealer');
            const eventArgument = controlValue(controls, '__EVENTARGUMENT');
            const isApply = controlValue(controls, 'ctl00$ContentPlaceHolder1$btnApply') === 'Apply';
            history.push(`POST:${isApply ? 'APPLY' : eventArgument}:${dealer}`);

            if (eventArgument === 'Page$2') return pageTwo;
            if (eventArgument === 'Page$1') return pageOne;
            return pageOne;
        },
    }, { scanAttempts: 1 });

    assert.equal(result.outcome, 'COMPLETE');
    assert.equal(result.pageCount, 2);
    assert.equal(result.rows.length, 3);
    assert.deepEqual(history, [
        'GET',
        'POST:APPLY:DEALER-001',
        'POST:Page$2:DEALER-001',
        'POST:Page$1:DEALER-001',
    ]);
});

test('failed report postback restarts from fresh GET and never replays stale ViewState', async () => {
    let getCount = 0;
    const postedViewStates: string[] = [];

    const result = await scanSoldPackagesReport({
        freshGet: async () => {
            getCount += 1;
            return fixture('initial-controls.html').replace(
                'view-state-part-0',
                `fresh-view-state-${getCount}`
            );
        },
        post: async (controls: readonly SuccessfulControl[]) => {
            postedViewStates.push(controlValue(controls, '__VIEWSTATE') ?? 'missing');
            if (postedViewStates.length === 1) {
                throw new Error('synthetic network interruption');
            }
            return fixture('report-empty.html');
        },
    });

    assert.equal(result.outcome, 'COMPLETE');
    assert.equal(result.scanAttemptCount, 2);
    assert.equal(getCount, 3);
    assert.deepEqual(postedViewStates, [
        'fresh-view-state-1',
        'fresh-view-state-2',
        'fresh-view-state-3',
    ]);
});

test('scan validation accepts a stable two-page traversal with normal back links', () => {
    const pageOne = parseSoldPackagesReportPage(fixture('report-page-reordered.html'));
    const pageTwo = parseSoldPackagesReportPage(fixture('report-page-two.html'));

    const result = validateSoldReportScan({
        visitedPages: [pageOne, pageTwo],
        firstPageRecheck: pageOne,
    });

    assert.equal(result.outcome, 'COMPLETE');
    assert.equal(result.pageCount, 2);
});

test('scan validation proves contiguous page coverage and exact provider total', () => {
    const pageOne = parseSoldPackagesReportPage(fixture('report-page-reordered.html'));
    const pageTwo = parseSoldPackagesReportPage(fixture('report-page-two.html'));
    const gap = validateSoldReportScan({
        visitedPages: [pageOne, { ...pageTwo, currentPage: 3 }],
        firstPageRecheck: pageOne,
    });
    const totalMismatch = validateSoldReportScan({
        visitedPages: [pageOne, { ...pageTwo, expectedTotalRows: 4 }],
        firstPageRecheck: pageOne,
    });
    const missingRows = validateSoldReportScan({
        visitedPages: [pageOne],
        firstPageRecheck: pageOne,
    });

    assert.equal(gap.reasonCode, 'PAGINATION_GAP');
    assert.equal(totalMismatch.reasonCode, 'REPORT_TOTAL_CHANGED');
    assert.equal(missingRows.reasonCode, 'REPORT_ROW_COUNT_MISMATCH');
});

test('scan validation rejects a repeated page number as a pagination cycle', () => {
    const pageOne = parseSoldPackagesReportPage(fixture('report-page-reordered.html'));
    const pageTwo = parseSoldPackagesReportPage(fixture('report-page-two.html'));

    const result = validateSoldReportScan({
        visitedPages: [pageOne, pageTwo, { ...pageOne, pageFingerprint: 'cycle-return' }],
        firstPageRecheck: pageOne,
    });

    assert.equal(result.outcome, 'INCOMPLETE_SCAN');
    assert.equal(result.reasonCode, 'PAGINATION_CYCLE');
});

test('scan validation rejects duplicate page content under a different page number', () => {
    const pageOne = parseSoldPackagesReportPage(fixture('report-page-reordered.html'));

    const result = validateSoldReportScan({
        visitedPages: [pageOne, { ...pageOne, currentPage: 2 }],
        firstPageRecheck: pageOne,
    });

    assert.equal(result.outcome, 'INCOMPLETE_SCAN');
    assert.equal(result.reasonCode, 'DUPLICATE_PAGE');
});

test('scan validation applies the default one-hundred-page cap', () => {
    const pageOne = parseSoldPackagesReportPage(fixture('report-page-reordered.html'));
    const pages = Array.from({ length: 101 }, (_, index) => ({
        ...pageOne,
        currentPage: index + 1,
        pageFingerprint: `unique-page-${index + 1}`,
    }));

    const result = validateSoldReportScan({
        visitedPages: pages,
        firstPageRecheck: pageOne,
    });

    assert.equal(result.outcome, 'INCOMPLETE_SCAN');
    assert.equal(result.reasonCode, 'PAGE_CAP_EXCEEDED');
    assert.equal(result.pageCap, 100);
});

test('scan validation rejects insertion that changes the first-page watermark', () => {
    const pageOne = parseSoldPackagesReportPage(fixture('report-page-reordered.html'));
    const pageTwo = parseSoldPackagesReportPage(fixture('report-page-two.html'));
    const changedFirstPage = parseSoldPackagesReportPage(fixture('report-page-one-changed.html'));

    const result = validateSoldReportScan({
        visitedPages: [pageOne, pageTwo],
        firstPageRecheck: changedFirstPage,
    });

    assert.equal(result.outcome, 'INCOMPLETE_SCAN');
    assert.equal(result.reasonCode, 'FIRST_PAGE_WATERMARK_CHANGED');
});

test('report summary Alone labels are counts and do not override the selected dealer identity', () => {
    const parsed = parseSoldPackagesReportPage(fixture('report-page-reordered.html'));

    assert.equal(parsed.outcome, 'COMPLETE');
    assert.match(parsed.dealerContextHash ?? '', /^[a-f0-9]{64}$/);
});

test('scan validation rejects a dealer identity change between pages', () => {
    const pageOne = parseSoldPackagesReportPage(fixture('report-page-reordered.html'));
    const pageTwo = parseSoldPackagesReportPage(fixture('report-page-two.html'));

    const result = validateSoldReportScan({
        visitedPages: [pageOne, { ...pageTwo, dealerContextHash: 'f'.repeat(64) }],
        firstPageRecheck: pageOne,
    });

    assert.equal(result.outcome, 'INCOMPLETE_SCAN');
    assert.equal(result.reasonCode, 'DEALER_CONTEXT_CHANGED');
});

test('multiple dealer selectors are ambiguous and never treated as valid absence', () => {
    const ambiguous = fixture('report-empty.html').replace(
        '</form>',
        '<select name="duplicate$ddlDealer"><option value="DEALER-002" selected>Other Dealer</option></select></form>'
    );
    const parsed = parseSoldPackagesReportPage(ambiguous);

    assert.equal(parsed.outcome, 'INCOMPLETE_SCAN');
    assert.equal(parsed.reasonCode, 'DEALER_CONTEXT_AMBIGUOUS');
});

test('Apply response must keep the same dealer selected by the fresh GET', async () => {
    const changedDealerReport = fixture('report-empty.html')
        .replace('value="DEALER-001" selected>Synthetic Dealer', 'value="DEALER-002" selected>Other Dealer')
        .replace('value="DEALER-002">Other Dealer', 'value="DEALER-001">Synthetic Dealer');

    const result = await scanSoldPackagesReport({
        freshGet: async () => fixture('initial-controls.html'),
        post: async () => changedDealerReport,
    }, { scanAttempts: 1 });

    assert.equal(result.outcome, 'INCOMPLETE_SCAN');
    assert.equal(result.reasonCode, 'DEALER_CONTEXT_CHANGED');
});

test('dealer group validation accepts punctuation variants but fails closed on ambiguity', () => {
    const base = fixture('report-page-reordered.html');
    const enDash = parseSoldPackagesReportPage(
        base.replace('Synthetic Dealer - Total Sold Packages:', 'Synthetic Dealer – Total Sold Packages:')
    );
    const noHyphen = parseSoldPackagesReportPage(
        base.replace('Synthetic Dealer - Total Sold Packages:', 'Synthetic Dealer Total Sold Packages:')
    );
    const emptyLabel = parseSoldPackagesReportPage(
        base.replace('Synthetic Dealer - Total Sold Packages:', ' - Total Sold Packages:')
    );
    const multipleGroups = parseSoldPackagesReportPage(
        base.replace(
            '<td colspan="9">Synthetic Dealer - Total Sold Packages: 3</td>',
            '<td colspan="9">Synthetic Dealer - Total Sold Packages: 3</td></tr><tr class="GridRow"><td colspan="9">Other Dealer Total Sold Packages: 1</td>'
        )
    );
    const unexpectedWithoutHyphen = parseSoldPackagesReportPage(
        fixture('report-aggregated.html').replace(
            'Other Dealer - Total Sold Packages:',
            'Other Dealer Total Sold Packages:'
        )
    );
    const unexpectedWithoutColspan = parseSoldPackagesReportPage(
        fixture('report-aggregated.html').replace(' colspan="9"', '')
    );
    const unexpectedHeadingCell = parseSoldPackagesReportPage(
        fixture('report-aggregated.html')
            .replace('<td colspan="9">Other Dealer', '<th colspan="9">Other Dealer')
            .replace('Total Sold Packages: 1</td>', 'Total Sold Packages: 1</th>')
    );
    const unexpectedSplitCells = parseSoldPackagesReportPage(
        fixture('report-aggregated.html').replace(
            '<td colspan="9">Other Dealer - Total Sold Packages: 1</td>',
            '<td>Other Dealer - </td><td colspan="8">Total Sold Packages: 1</td>'
        )
    );

    assert.equal(enDash.outcome, 'COMPLETE');
    assert.equal(noHyphen.outcome, 'COMPLETE');
    assert.equal(emptyLabel.reasonCode, 'UNPARSEABLE_DEALER_GROUP');
    assert.equal(multipleGroups.reasonCode, 'UNEXPECTED_DEALER_GROUP');
    assert.equal(unexpectedWithoutHyphen.reasonCode, 'UNEXPECTED_DEALER_GROUP');
    assert.equal(unexpectedWithoutColspan.reasonCode, 'UNEXPECTED_DEALER_GROUP');
    assert.equal(unexpectedHeadingCell.reasonCode, 'UNEXPECTED_DEALER_GROUP');
    assert.equal(unexpectedSplitCells.reasonCode, 'UNEXPECTED_DEALER_GROUP');
});

test('non-empty report requires exactly one selected-dealer total marker', () => {
    const withoutMarker = fixture('report-page-reordered.html').replace(
        '    <tr class="GridRow" style="background-color:orange">\n      <td colspan="9">Synthetic Dealer - Total Sold Packages: 3</td>\n    </tr>\n',
        ''
    );
    const parsed = parseSoldPackagesReportPage(withoutMarker);

    assert.equal(parsed.outcome, 'INCOMPLETE_SCAN');
    assert.equal(parsed.reasonCode, 'MISSING_DEALER_GROUP');
});

test('dealer context hash also binds item type and date criteria', () => {
    const base = fixture('report-empty.html');
    const original = parseSoldPackagesReportPage(base);
    const differentItem = parseSoldPackagesReportPage(
        base
            .replace('value="ALL" selected', 'value="ALL"')
            .replace('value="Card_CISCO"', 'value="Card_CISCO" selected')
    );
    const differentDate = parseSoldPackagesReportPage(
        base.replace('value="24/08/2026">', 'value="23/08/2026">')
    );

    assert.equal(original.outcome, 'COMPLETE');
    assert.equal(differentItem.outcome, 'COMPLETE');
    assert.equal(differentDate.outcome, 'COMPLETE');
    assert.notEqual(original.dealerContextHash, differentItem.dealerContextHash);
    assert.notEqual(original.dealerContextHash, differentDate.dealerContextHash);
});

test('opaque dealer option value casing changes the dealer context hash', () => {
    const upper = parseSoldPackagesReportPage(fixture('report-empty.html'));
    const lower = parseSoldPackagesReportPage(
        fixture('report-empty.html').replace('value="DEALER-001"', 'value="dealer-001"')
    );

    assert.equal(upper.outcome, 'COMPLETE');
    assert.equal(lower.outcome, 'COMPLETE');
    assert.notEqual(upper.dealerContextHash, lower.dealerContextHash);
});
