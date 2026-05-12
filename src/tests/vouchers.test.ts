import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from './mocks/node.js'
import { makeVoucher, makeVoucherPos } from './mocks/fixtures.js'
import {
  listVouchers,
  getVoucher,
  uploadVoucherFile,
  createVoucher,
  updateVoucher,
  deleteVoucher,
  bookVoucherPayment,
  enshrineVoucher,
  listVoucherPositions,
  getVoucherPosition,
  createVoucherPosition,
  updateVoucherPosition,
  deleteVoucherPosition,
  formatVoucher,
  formatVouchersList,
  formatVoucherResult,
  formatVoucherDeleteResult,
  formatVoucherPaymentResult,
  formatEnshrineResult,
  formatUploadResult,
  formatVoucherPosition,
  formatVoucherPositionsList,
  formatVoucherPositionResult,
  formatVoucherPositionDeleteResult,
} from '../tools/vouchers.js'

const BASE = 'https://my.sevdesk.de/api/v1'

const baseVoucherParams = {
  voucherDate: '2024-01-15',
  creditDebit: 'D',
  positions: [{ sum: 100, taxRate: 19, accountingTypeId: 50 }],
}

describe('listVouchers', () => {
  it('lists vouchers with default params', async () => {
    let url = ''
    server.use(
      http.get(`${BASE}/Voucher`, ({ request }) => {
        url = request.url
        return HttpResponse.json({ objects: [makeVoucher()] })
      })
    )
    const result = await listVouchers({})
    expect(result).toHaveLength(1)
    expect(url).toContain('limit=100')
  })

  it('filters by creditDebit C (credit)', async () => {
    let url = ''
    server.use(
      http.get(`${BASE}/Voucher`, ({ request }) => {
        url = request.url
        return HttpResponse.json({ objects: [] })
      })
    )
    await listVouchers({ creditDebit: 'C' })
    expect(url).toContain('creditDebit=C')
  })

  it('filters by creditDebit D (debit)', async () => {
    let url = ''
    server.use(
      http.get(`${BASE}/Voucher`, ({ request }) => {
        url = request.url
        return HttpResponse.json({ objects: [] })
      })
    )
    await listVouchers({ creditDebit: 'D' })
    expect(url).toContain('creditDebit=D')
  })

  it('filters by status', async () => {
    let url = ''
    server.use(
      http.get(`${BASE}/Voucher`, ({ request }) => {
        url = request.url
        return HttpResponse.json({ objects: [] })
      })
    )
    await listVouchers({ status: '100', startDate: '2024-01-01', endDate: '2024-12-31' })
    expect(url).toContain('status=100')
  })

  it('filters by supplierId with bracketed params', async () => {
    let url = ''
    server.use(
      http.get(`${BASE}/Voucher`, ({ request }) => {
        url = request.url
        return HttpResponse.json({ objects: [] })
      })
    )
    await listVouchers({ supplierId: '5' })
    expect(url).toContain('supplier%5Bid%5D=5')
    expect(url).toContain('supplier%5BobjectName%5D=Contact')
  })
})

describe('getVoucher', () => {
  it('returns a single voucher', async () => {
    server.use(
      http.get(`${BASE}/Voucher/20`, () =>
        HttpResponse.json({ objects: makeVoucher({ id: '20' }) })
      )
    )
    const result = await getVoucher({ id: '20' })
    expect(result.id).toBe('20')
  })
})

describe('uploadVoucherFile', () => {
  it('uploads file and returns filename', async () => {
    server.use(
      http.post(`${BASE}/Voucher/Factory/uploadTempFile`, () =>
        HttpResponse.json({
          objects: { filename: 'receipt.pdf', pages: 2, mimeType: 'application/pdf', originMimeType: 'image/jpeg' },
        })
      )
    )
    const result = await uploadVoucherFile({
      fileContent: Buffer.from('test').toString('base64'),
      fileName: 'receipt.pdf',
    })
    expect(result.filename).toBe('receipt.pdf')
    expect(result.pages).toBe(2)
  })
})

describe('createVoucher', () => {
  it('creates voucher with minimal params', async () => {
    let capturedBody: Record<string, unknown> = {}
    server.use(
      http.post(`${BASE}/Voucher/Factory/saveVoucher`, async ({ request }) => {
        capturedBody = await request.json() as Record<string, unknown>
        return HttpResponse.json({ objects: { voucher: makeVoucher() } })
      })
    )
    await createVoucher(baseVoucherParams)
    const v = capturedBody.voucher as Record<string, unknown>
    expect(v.voucherType).toBe('VOU')
    expect(v.status).toBe(50)
    expect(v.supplier).toBeUndefined()
    expect(capturedBody.filename).toBeUndefined()
  })

  it('includes supplierId as supplier object', async () => {
    let capturedBody: Record<string, unknown> = {}
    server.use(
      http.post(`${BASE}/Voucher/Factory/saveVoucher`, async ({ request }) => {
        capturedBody = await request.json() as Record<string, unknown>
        return HttpResponse.json({ objects: { voucher: makeVoucher() } })
      })
    )
    await createVoucher({ ...baseVoucherParams, supplierId: '5' })
    const v = capturedBody.voucher as Record<string, unknown>
    expect(v.supplier).toEqual({ id: '5', objectName: 'Contact' })
  })

  it('includes costCentreId as costCentre object', async () => {
    let capturedBody: Record<string, unknown> = {}
    server.use(
      http.post(`${BASE}/Voucher/Factory/saveVoucher`, async ({ request }) => {
        capturedBody = await request.json() as Record<string, unknown>
        return HttpResponse.json({ objects: { voucher: makeVoucher() } })
      })
    )
    await createVoucher({ ...baseVoucherParams, costCentreId: 'CC-1' })
    const v = capturedBody.voucher as Record<string, unknown>
    expect(v.costCentre).toEqual({ id: 'CC-1', objectName: 'CostCentre' })
  })

  it('forces taxType="default" when taxRule provided', async () => {
    let capturedBody: Record<string, unknown> = {}
    server.use(
      http.post(`${BASE}/Voucher/Factory/saveVoucher`, async ({ request }) => {
        capturedBody = await request.json() as Record<string, unknown>
        return HttpResponse.json({ objects: { voucher: makeVoucher() } })
      })
    )
    await createVoucher({ ...baseVoucherParams, taxRule: 1, taxType: 'eu' })
    const v = capturedBody.voucher as Record<string, unknown>
    expect(v.taxType).toBe('default')
    expect(v.taxRule).toEqual({ id: 1, objectName: 'TaxRule' })
  })

  it('uses provided taxType when no taxRule', async () => {
    let capturedBody: Record<string, unknown> = {}
    server.use(
      http.post(`${BASE}/Voucher/Factory/saveVoucher`, async ({ request }) => {
        capturedBody = await request.json() as Record<string, unknown>
        return HttpResponse.json({ objects: { voucher: makeVoucher() } })
      })
    )
    await createVoucher({ ...baseVoucherParams, taxType: 'eu' })
    const v = capturedBody.voucher as Record<string, unknown>
    expect(v.taxType).toBe('eu')
  })

  it('attaches filename when provided', async () => {
    let capturedBody: Record<string, unknown> = {}
    server.use(
      http.post(`${BASE}/Voucher/Factory/saveVoucher`, async ({ request }) => {
        capturedBody = await request.json() as Record<string, unknown>
        return HttpResponse.json({ objects: { voucher: makeVoucher() } })
      })
    )
    await createVoucher({ ...baseVoucherParams, filename: 'receipt.pdf' })
    expect(capturedBody.filename).toBe('receipt.pdf')
  })

  it('defaults position net to true when not specified', async () => {
    let capturedBody: Record<string, unknown> = {}
    server.use(
      http.post(`${BASE}/Voucher/Factory/saveVoucher`, async ({ request }) => {
        capturedBody = await request.json() as Record<string, unknown>
        return HttpResponse.json({ objects: { voucher: makeVoucher() } })
      })
    )
    await createVoucher({ ...baseVoucherParams })
    const positions = capturedBody.voucherPosSave as Array<Record<string, unknown>>
    expect(positions[0].net).toBe(true)
  })

  it('sends net=false when explicitly set', async () => {
    let capturedBody: Record<string, unknown> = {}
    server.use(
      http.post(`${BASE}/Voucher/Factory/saveVoucher`, async ({ request }) => {
        capturedBody = await request.json() as Record<string, unknown>
        return HttpResponse.json({ objects: { voucher: makeVoucher() } })
      })
    )
    await createVoucher({
      ...baseVoucherParams,
      positions: [{ sum: 100, taxRate: 19, accountingTypeId: 50, net: false, comment: 'Note', isAsset: true }],
    })
    const positions = capturedBody.voucherPosSave as Array<Record<string, unknown>>
    expect(positions[0].net).toBe(false)
    expect(positions[0].comment).toBe('Note')
    expect(positions[0].isAsset).toBe(true)
  })

  it('sends all optional voucher fields', async () => {
    let capturedBody: Record<string, unknown> = {}
    server.use(
      http.post(`${BASE}/Voucher/Factory/saveVoucher`, async ({ request }) => {
        capturedBody = await request.json() as Record<string, unknown>
        return HttpResponse.json({ objects: { voucher: makeVoucher() } })
      })
    )
    await createVoucher({
      ...baseVoucherParams,
      description: 'Office supplies',
      paymentDeadline: '2024-02-15',
      currency: 'USD',
      voucherType: 'TA',
    })
    const v = capturedBody.voucher as Record<string, unknown>
    expect(v.description).toBe('Office supplies')
    expect(v.paymentDeadline).toBe('2024-02-15')
    expect(v.currency).toBe('USD')
    expect(v.voucherType).toBe('TA')
  })
})

describe('updateVoucher', () => {
  it('sends only provided fields', async () => {
    let capturedBody: Record<string, unknown> = {}
    server.use(
      http.put(`${BASE}/Voucher/20`, async ({ request }) => {
        capturedBody = await request.json() as Record<string, unknown>
        return HttpResponse.json({ objects: makeVoucher() })
      })
    )
    await updateVoucher({ id: '20', description: 'Updated' })
    expect(capturedBody.description).toBe('Updated')
    expect(capturedBody.paymentDeadline).toBeUndefined()
  })

  it('updates costCentre when costCentreId provided', async () => {
    let capturedBody: Record<string, unknown> = {}
    server.use(
      http.put(`${BASE}/Voucher/20`, async ({ request }) => {
        capturedBody = await request.json() as Record<string, unknown>
        return HttpResponse.json({ objects: makeVoucher() })
      })
    )
    await updateVoucher({ id: '20', costCentreId: 'CC-2', deliveryDate: '2024-02-01', paymentDeadline: '2024-02-15' })
    expect(capturedBody.costCentre).toEqual({ id: 'CC-2', objectName: 'CostCentre' })
    expect(capturedBody.deliveryDate).toBe('2024-02-01')
  })
})

describe('deleteVoucher', () => {
  it('sends DELETE', async () => {
    let deleted = false
    server.use(
      http.delete(`${BASE}/Voucher/20`, () => {
        deleted = true
        return new HttpResponse(null, { status: 200 })
      })
    )
    await deleteVoucher({ id: '20' })
    expect(deleted).toBe(true)
  })
})

describe('bookVoucherPayment', () => {
  it('books payment with defaults', async () => {
    let capturedBody: Record<string, unknown> = {}
    server.use(
      http.put(`${BASE}/Voucher/20/bookAmount`, async ({ request }) => {
        capturedBody = await request.json() as Record<string, unknown>
        return HttpResponse.json({ objects: makeVoucher({ paidAmount: 119 }) })
      })
    )
    await bookVoucherPayment({ id: '20', amount: 119 })
    expect(capturedBody.amount).toBe(119)
    expect(capturedBody.type).toBe('N')
    expect(capturedBody.checkAccount).toBeUndefined()
  })

  it('includes checkAccount and checkAccountTransaction when provided', async () => {
    let capturedBody: Record<string, unknown> = {}
    server.use(
      http.put(`${BASE}/Voucher/20/bookAmount`, async ({ request }) => {
        capturedBody = await request.json() as Record<string, unknown>
        return HttpResponse.json({ objects: makeVoucher() })
      })
    )
    await bookVoucherPayment({
      id: '20',
      amount: 100,
      date: '2024-01-15',
      checkAccountId: 'CA-1',
      checkAccountTransactionId: 'CAT-1',
      type: 'N',
    })
    expect(capturedBody.checkAccount).toEqual({ id: 'CA-1', objectName: 'CheckAccount' })
    expect(capturedBody.checkAccountTransaction).toEqual({ id: 'CAT-1', objectName: 'CheckAccountTransaction' })
  })
})

describe('enshrineVoucher', () => {
  it('calls enshrine endpoint', async () => {
    let called = false
    server.use(
      http.put(`${BASE}/Voucher/20/enshrine`, () => {
        called = true
        return HttpResponse.json({ objects: makeVoucher() })
      })
    )
    await enshrineVoucher({ id: '20' })
    expect(called).toBe(true)
  })
})

describe('voucher positions', () => {
  it('listVoucherPositions sends bracketed params', async () => {
    let url = ''
    server.use(
      http.get(`${BASE}/VoucherPos`, ({ request }) => {
        url = request.url
        return HttpResponse.json({ objects: [makeVoucherPos()] })
      })
    )
    await listVoucherPositions({ voucherId: '20' })
    expect(url).toContain('voucher%5Bid%5D=20')
  })

  it('getVoucherPosition returns a position', async () => {
    const result = await getVoucherPosition({ id: '200' })
    expect(result.id).toBe('200')
  })

  it('createVoucherPosition with comment', async () => {
    let capturedBody: Record<string, unknown> = {}
    server.use(
      http.post(`${BASE}/VoucherPos`, async ({ request }) => {
        capturedBody = await request.json() as Record<string, unknown>
        return HttpResponse.json({ objects: makeVoucherPos() })
      })
    )
    await createVoucherPosition({ voucherId: '20', sum: 100, taxRate: 19, accountingTypeId: 50, comment: 'Test', isAsset: true, net: true })
    expect(capturedBody.voucher).toEqual({ id: '20', objectName: 'Voucher' })
    expect(capturedBody.comment).toBe('Test')
    expect(capturedBody.isAsset).toBe(true)
  })

  it('createVoucherPosition with net=false when explicitly set', async () => {
    let capturedBody: Record<string, unknown> = {}
    server.use(
      http.post(`${BASE}/VoucherPos`, async ({ request }) => {
        capturedBody = await request.json() as Record<string, unknown>
        return HttpResponse.json({ objects: makeVoucherPos() })
      })
    )
    await createVoucherPosition({ voucherId: '20', sum: 100, taxRate: 19, accountingTypeId: 50, net: false })
    expect(capturedBody.net).toBe(false)
    expect(capturedBody.comment).toBeUndefined()
  })

  it('updateVoucherPosition sends provided fields', async () => {
    let capturedBody: Record<string, unknown> = {}
    server.use(
      http.put(`${BASE}/VoucherPos/200`, async ({ request }) => {
        capturedBody = await request.json() as Record<string, unknown>
        return HttpResponse.json({ objects: makeVoucherPos() })
      })
    )
    await updateVoucherPosition({ id: '200', sum: 200, taxRate: 7, comment: 'Updated' })
    expect(capturedBody.sum).toBe(200)
    expect(capturedBody.comment).toBe('Updated')
  })

  it('updateVoucherPosition with no optional fields (false branches)', async () => {
    let capturedBody: Record<string, unknown> = {}
    server.use(
      http.put(`${BASE}/VoucherPos/200`, async ({ request }) => {
        capturedBody = await request.json() as Record<string, unknown>
        return HttpResponse.json({ objects: makeVoucherPos() })
      })
    )
    await updateVoucherPosition({ id: '200' })
    expect(capturedBody.sum).toBeUndefined()
    expect(capturedBody.taxRate).toBeUndefined()
    expect(capturedBody.comment).toBeUndefined()
  })

  it('deleteVoucherPosition sends DELETE', async () => {
    let deleted = false
    server.use(
      http.delete(`${BASE}/VoucherPos/200`, () => {
        deleted = true
        return new HttpResponse(null, { status: 200 })
      })
    )
    await deleteVoucherPosition({ id: '200' })
    expect(deleted).toBe(true)
  })
})

describe('formatVoucher', () => {
  it('formats voucher with supplierName', () => {
    const v = makeVoucher({ supplierName: 'ACME GmbH', description: 'Test', payDate: '2024-01-20', paidAmount: 100, deliveryDate: '2024-01-15', creditDebit: 'C', status: '100' })
    const output = formatVoucher(v)
    expect(output).toContain('Supplier: ACME GmbH')
    expect(output).toContain('Description: Test')
    expect(output).toContain('Pay Date: 2024-01-20')
    expect(output).toContain('Paid Amount: 100')
    expect(output).toContain('Delivery Date: 2024-01-15')
    expect(output).toContain('Credit (Expense)')
    expect(output).toContain('Unpaid')
  })

  it('shows supplier ID when no supplierName', () => {
    const v = makeVoucher({ supplierName: null, supplier: { id: '5', objectName: 'Contact' } })
    const output = formatVoucher(v)
    expect(output).toContain('Supplier ID: 5')
  })

  it('formats voucher status 50 (Draft)', () => {
    const output = formatVoucher(makeVoucher({ status: '50' }))
    expect(output).toContain('Draft')
  })

  it('formats voucher status 1000 (Paid)', () => {
    const output = formatVoucher(makeVoucher({ status: '1000' }))
    expect(output).toContain('Paid')
  })

  it('formats unknown status', () => {
    const output = formatVoucher(makeVoucher({ status: '999' }))
    expect(output).toContain('Unknown (999)')
  })

  it('formats creditDebit C as expense credit', () => {
    const output = formatVoucher(makeVoucher({ creditDebit: 'C' }))
    expect(output).toContain('Credit (Expense)')
  })

  it('formats creditDebit D as revenue debit', () => {
    const output = formatVoucher(makeVoucher({ creditDebit: 'D' }))
    expect(output).toContain('Debit (Revenue)')
  })

  it('skips optional fields when null', () => {
    const v = makeVoucher({ supplierName: null, supplier: null, description: null, payDate: null, paidAmount: null, deliveryDate: null })
    const output = formatVoucher(v)
    expect(output).not.toContain('Supplier:')
    expect(output).not.toContain('Description:')
    expect(output).not.toContain('Pay Date:')
    expect(output).not.toContain('Paid Amount:')
  })

  it('skips Tax Type line when taxType is null', () => {
    const v = makeVoucher({ taxType: null as unknown as string })
    const output = formatVoucher(v)
    expect(output).not.toContain('Tax Type:')
  })
})

describe('formatVouchersList', () => {
  it('returns "No vouchers found." for empty array', () => {
    expect(formatVouchersList([])).toBe('No vouchers found.')
  })

  it('lists vouchers including credit type', () => {
    const vCR = makeVoucher({ id: '1', creditDebit: 'C', supplierName: 'Vendor' })
    const vDR = makeVoucher({ id: '2', creditDebit: 'D', supplierName: null })
    const output = formatVouchersList([vCR, vDR])
    expect(output).toContain('CR')
    expect(output).toContain('DR')
    expect(output).toContain('Vendor')
    expect(output).toContain('Unknown')
  })
})

describe('format functions', () => {
  it('formatVoucherResult includes action', () => {
    expect(formatVoucherResult(makeVoucher(), 'created')).toContain('created successfully')
  })

  it('formatVoucherDeleteResult includes ID', () => {
    expect(formatVoucherDeleteResult('20')).toBe('Voucher 20 deleted successfully.')
  })

  it('formatVoucherPaymentResult includes amount and ID', () => {
    const output = formatVoucherPaymentResult(makeVoucher({ id: '20', paidAmount: 119 }), 119)
    expect(output).toContain('119')
    expect(output).toContain('20')
  })

  it('formatEnshrineResult includes voucher ID', () => {
    expect(formatEnshrineResult(makeVoucher({ id: '20' }))).toContain('20')
  })

  it('formatUploadResult with all fields', () => {
    const output = formatUploadResult({ filename: 'test.pdf', pages: 3, mimeType: 'application/pdf', originMimeType: 'image/jpeg' })
    expect(output).toContain('test.pdf')
    expect(output).toContain('Pages: 3')
    expect(output).toContain('MIME Type: application/pdf')
    expect(output).toContain('Original MIME Type: image/jpeg')
  })

  it('formatUploadResult without optional fields', () => {
    const output = formatUploadResult({ filename: 'test.pdf' })
    expect(output).toContain('test.pdf')
    expect(output).not.toContain('Pages:')
  })
})

describe('formatVoucherPosition', () => {
  it('formats position with comment and isAsset', () => {
    const pos = makeVoucherPos({ comment: 'My comment', isAsset: true })
    const output = formatVoucherPosition(pos)
    expect(output).toContain('Comment: My comment')
    expect(output).toContain('Is Asset: Yes')
  })

  it('formats position without optional fields', () => {
    const pos = makeVoucherPos({ comment: null, isAsset: false })
    const output = formatVoucherPosition(pos)
    expect(output).not.toContain('Comment:')
    expect(output).not.toContain('Is Asset:')
  })
})

describe('formatVoucherPositionsList', () => {
  it('returns message for empty array', () => {
    expect(formatVoucherPositionsList([])).toBe('No voucher positions found.')
  })

  it('lists positions', () => {
    const output = formatVoucherPositionsList([makeVoucherPos()])
    expect(output).toContain('Found 1 position(s)')
  })
})

describe('position format functions', () => {
  it('formatVoucherPositionResult includes action', () => {
    expect(formatVoucherPositionResult(makeVoucherPos(), 'created')).toContain('created successfully')
  })

  it('formatVoucherPositionDeleteResult includes ID', () => {
    expect(formatVoucherPositionDeleteResult('200')).toBe('Voucher position 200 deleted successfully.')
  })
})
