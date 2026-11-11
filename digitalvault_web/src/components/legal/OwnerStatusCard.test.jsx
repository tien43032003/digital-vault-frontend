import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import OwnerStatusCard from './OwnerStatusCard'

const at = (y, m, d, h, mi) => new Date(y, m - 1, d, h, mi).toISOString()
const status = {
  ownerId: 5,
  fullName: 'Phạm Nhật Tiến',
  status: 'Triggered',
  lastConfirmedAliveAt: at(2026, 9, 1, 8, 0),
  verifiedAt: at(2026, 10, 23, 14, 26),
  deathCertificateDocumentId: 8,
}

describe('OwnerStatusCard', () => {
  it('status_Given_ShowsOwnerStateTimesAndCertificate', () => {
    render(<OwnerStatusCard status={status} />)
    expect(screen.getByRole('heading', { name: 'Tình trạng chủ kho' })).toBeInTheDocument()
    expect(screen.getByText('Phạm Nhật Tiến')).toBeInTheDocument()
    expect(screen.getByText('Đã kích hoạt')).toBeInTheDocument()
    expect(screen.getByText('01/09/2026 08:00')).toBeInTheDocument()
    expect(screen.getByText('23/10/2026 14:26')).toBeInTheDocument()
    expect(screen.getByText('Tài liệu #8')).toBeInTheDocument()
  })

  it('status_ConfirmedDeceased_IsShownInVietnamese', () => {
    render(<OwnerStatusCard status={{ ...status, status: 'ConfirmedDeceased' }} />)
    expect(screen.getByText('Đã xác nhận qua đời')).toBeInTheDocument()
    expect(screen.queryByText('ConfirmedDeceased')).not.toBeInTheDocument()
  })

  it('status_UnknownValue_IsKeptAsReceived', () => {
    render(<OwnerStatusCard status={{ ...status, status: 'SomethingNew' }} />)
    expect(screen.getByText('SomethingNew')).toBeInTheDocument()
  })

  it('certificate_NameKnown_ShowsFileNameWithDocumentId', () => {
    render(<OwnerStatusCard status={{ ...status, deathCertificateDocumentId: 25 }} certificateName="giay-chung-tu.pdf" />)
    expect(screen.getByText('giay-chung-tu.pdf (tài liệu #25)')).toBeInTheDocument()
  })

  it('certificate_DownloadClicked_PassesDocumentId', () => {
    const onDownload = vi.fn()
    render(<OwnerStatusCard status={status} onDownloadDeathCertificate={onDownload} />)
    fireEvent.click(screen.getByRole('button', { name: /Tải giấy chứng tử/ }))
    expect(onDownload).toHaveBeenCalledWith(8)
  })

  it('status_NoCertificateAndNoDates_ShowsDashes', () => {
    render(<OwnerStatusCard status={{ fullName: 'A', status: null, lastConfirmedAliveAt: null, verifiedAt: null, deathCertificateDocumentId: null }} />)
    expect(screen.getByText('Không có giấy chứng tử (không bắt buộc)')).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3)
    expect(screen.queryByRole('button', { name: /Tải giấy chứng tử/ })).not.toBeInTheDocument()
  })

  it('status_Missing_RendersNothing', () => {
    const { container } = render(<OwnerStatusCard status={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
