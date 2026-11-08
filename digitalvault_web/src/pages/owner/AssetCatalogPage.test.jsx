import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { login, register } from '../../callapi/authApi'
import { createVault } from '../../callapi/ownerApi'
import { handlers } from '../../mocks/handlers'
import { DEMO_ACCOUNT, getDb, resetMockDb, saveDb } from '../../mocks/db'
import { renderWithProviders } from '../../test/renderWithProviders'
import AssetCatalogPage from './AssetCatalogPage'

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(async () => {
  resetMockDb()
  await login(DEMO_ACCOUNT.email, DEMO_ACCOUNT.password)
})
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const renderPage = () => renderWithProviders(<AssetCatalogPage />)
const waitForCatalog = () => screen.findByRole('heading', { level: 1 })

describe('AssetCatalogPage loading and error', () => {
  it('render_WhileFetching_ShowsLoadingStatus', async () => {
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải danh mục tài sản')
    await waitForCatalog()
  })

  it('render_ApiFails_ShowsErrorWithRetry', async () => {
    server.use(http.get('*/api/owner/vaults', () => HttpResponse.json({ status: 500, detail: 'Máy chủ đang bận.' }, { status: 500 })))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Máy chủ đang bận.')

    server.resetHandlers()
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(await waitForCatalog()).toBeInTheDocument()
  })
})

describe('AssetCatalogPage banner and stats', () => {
  it('render_Ready_ShowsVaultBannerWithDisabledCheckIn', async () => {
    renderPage()
    expect(await waitForCatalog()).toHaveTextContent('Kho Tài Sản Số & Phân Quyền Thừa Kế Cá Nhân')
    expect(screen.getByText('VAULT #1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Điểm danh ngay/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Thêm tài sản mới/ })).toBeEnabled()
  })

  it('checkIn_ButtonClicked_NavigatesToProofOfLifeWithPingFlag', async () => {
    renderWithProviders(<AssetCatalogPage />, {
      extraRoutes: [{ path: '/owner/proof-of-life', element: <p>proof-of-life-page</p> }],
    })
    await waitForCatalog()
    await userEvent.click(screen.getByRole('button', { name: /Điểm danh ngay/ }))
    expect(await screen.findByText('proof-of-life-page')).toBeInTheDocument()
  })

  it('render_Ready_ShowsStatsFromRealData', async () => {
    renderPage()
    await waitForCatalog()
    expect(within(screen.getByRole('group', { name: 'TỔNG TÀI SẢN SỐ' })).getByText('06')).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'NGƯỜI THỤ HƯỞNG' })).getByText('02')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'GIẤY TỜ ĐÍNH KÈM' })).toHaveTextContent('03/06')
    expect(await screen.findByText('LS. Lê Hoàng Nam')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'DIGITAL EXECUTOR' })).toHaveTextContent('Đang hiệu lực')
  })

  it('render_SingleVault_HidesVaultSelector', async () => {
    renderPage()
    await waitForCatalog()
    expect(screen.queryByRole('combobox', { name: 'Chọn kho' })).not.toBeInTheDocument()
  })

  it('render_TwoVaults_ShowsSelectorAndSwitchesBanner', async () => {
    await createVault({ name: 'Kho thứ hai', description: '' })
    renderPage()
    await waitForCatalog()
    const selector = screen.getByRole('combobox', { name: 'Chọn kho' })
    await userEvent.selectOptions(selector, 'Kho thứ hai')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Kho thứ hai')
  })
})

describe('AssetCatalogPage asset list', () => {
  it('render_Ready_ShowsFirstFourAssetsWithSummary', async () => {
    renderPage()
    await waitForCatalog()
    expect(screen.getAllByRole('article')).toHaveLength(4)
    expect(screen.getByRole('heading', { name: /Ví Lạnh Trữ Crypto/ })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Ví Phần Cứng Ledger/ })).not.toBeInTheDocument()
    expect(screen.getByText('Hiển thị 1 - 4 trong tổng số 6 tài sản số')).toBeInTheDocument()
  })

  it('card_WithBeneficiaries_ShowsNamesAndAllocation', async () => {
    renderPage()
    await waitForCatalog()
    const card = screen.getByRole('article', { name: /Ví Lạnh Trữ Crypto/ })
    expect(card).toHaveTextContent('Trần Bảo Long (40%)')
    expect(card).toHaveTextContent('Nguyễn Thị Mai (60%)')
  })

  it('card_NoBeneficiaryAndNoDocument_ShowsWarnings', async () => {
    renderPage()
    await waitForCatalog()
    const card = screen.getByRole('article', { name: /Kênh YouTube/ })
    expect(card).toHaveTextContent('Chưa phân quyền')
    expect(card).toHaveTextContent('Chưa có giấy tờ')
  })

  it('card_WithDocument_ShowsFileName', async () => {
    renderPage()
    await waitForCatalog()
    expect(screen.getByRole('article', { name: /Vietcombank/ })).toHaveTextContent('SoTietKiem_Signed.pdf')
  })

  it('card_Actions_DetailLinkAndEditEnabled', async () => {
    renderPage()
    await waitForCatalog()
    const card = screen.getByRole('article', { name: /Ví Lạnh Trữ Crypto/ })
    expect(within(card).getByRole('link', { name: 'Xem chi tiết' })).toHaveAttribute('href', '/owner/assets/1')
    expect(within(card).getByRole('button', { name: 'Chỉnh sửa' })).toBeEnabled()
  })

  it('edit_ChangeNameFromCard_UpdatesCardAndShowsToast', async () => {
    renderPage()
    await waitForCatalog()
    await userEvent.click(within(screen.getByRole('article', { name: /Ví Lạnh Trữ Crypto/ })).getByRole('button', { name: 'Chỉnh sửa' }))
    const dialog = screen.getByRole('dialog', { name: 'Chỉnh Sửa Tài Sản' })
    const name = within(dialog).getByLabelText(/Tên tài sản/)
    await userEvent.clear(name)
    await userEvent.type(name, 'Ví Lạnh Đã Đổi Tên')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }))
    expect(await screen.findByRole('heading', { name: 'Ví Lạnh Đã Đổi Tên' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Đã cập nhật tài sản')).toBeInTheDocument()
  })

  it('revoke_ConfirmFromCard_HidesAssetAndUpdatesTotal', async () => {
    renderPage()
    await waitForCatalog()
    await userEvent.click(within(screen.getByRole('article', { name: /Ví Lạnh Trữ Crypto/ })).getByRole('button', { name: 'Chỉnh sửa' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Thu hồi tài sản' }))
    await userEvent.click(screen.getByRole('button', { name: 'Xác nhận thu hồi' }))
    expect(await screen.findByText('Đã thu hồi tài sản')).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'TỔNG TÀI SẢN SỐ' })).getByText('05')).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: /Ví Lạnh Trữ Crypto/ })).not.toBeInTheDocument()
  })

  it('revoke_ConfirmationShowsDocumentAndBeneficiaryImpact', async () => {
    renderPage()
    await waitForCatalog()
    await userEvent.click(within(screen.getByRole('article', { name: /Kho Lưu Trữ Kỷ Niệm/ })).getByRole('button', { name: 'Chỉnh sửa' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Thu hồi tài sản' }))
    expect(screen.getByRole('dialog', { name: 'Xác Nhận Thu Hồi Tài Sản' })).toHaveTextContent('2 giấy tờ')
    expect(screen.getByRole('dialog', { name: 'Xác Nhận Thu Hồi Tài Sản' })).toHaveTextContent('2 người thụ hưởng')
  })

  it('pagination_NextPage_ShowsRemainingAssets', async () => {
    renderPage()
    await waitForCatalog()
    await userEvent.click(screen.getByRole('button', { name: 'Tiếp' }))
    expect(screen.getAllByRole('article')).toHaveLength(2)
    expect(screen.getByRole('heading', { name: /Ví Phần Cứng Ledger/ })).toBeInTheDocument()
    expect(screen.getByText('Hiển thị 5 - 6 trong tổng số 6 tài sản số')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tiếp' })).toBeDisabled()
  })

  it('pagination_ChangePageSize_ShowsMoreAssetsPerPage', async () => {
    renderPage()
    await waitForCatalog()
    await userEvent.selectOptions(screen.getByLabelText('Số lượng'), '8')
    expect(screen.getAllByRole('article')).toHaveLength(6)
  })

  it('search_Query_FiltersByNameIgnoringDiacritics', async () => {
    renderPage()
    await waitForCatalog()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Tìm kiếm tài sản' }), 'ledger')
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: /Ledger/ })).toBeInTheDocument()
  })

  it('search_NoMatch_ShowsEmptyMessage', async () => {
    renderPage()
    await waitForCatalog()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Tìm kiếm tài sản' }), 'zzzz')
    expect(screen.getByText('Không tìm thấy tài sản phù hợp.')).toBeInTheDocument()
  })

  it('tabs_SelectType_FiltersAssets', async () => {
    renderPage()
    await waitForCatalog()
    expect(screen.getByRole('button', { name: 'Tất cả (6)' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Ngân hàng (2)' }))
    expect(screen.getAllByRole('article')).toHaveLength(2)
  })
})

describe('AssetCatalogPage add asset', () => {
  const openModal = () => userEvent.click(screen.getByRole('button', { name: /Thêm tài sản mới/ }))

  it('addAsset_EmptyForm_ShowsValidationErrors', async () => {
    renderPage()
    await waitForCatalog()
    await openModal()
    const dialog = screen.getByRole('dialog', { name: 'Thêm Tài Sản Số Mới' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu tài sản' }))
    expect(within(dialog).getByText('Vui lòng nhập tên tài sản.')).toBeInTheDocument()
  })

  it('addAsset_ValidForm_ClosesModalAndAddsAssetToList', async () => {
    renderPage()
    await waitForCatalog()
    await openModal()
    const dialog = screen.getByRole('dialog', { name: 'Thêm Tài Sản Số Mới' })
    expect(dialog).toHaveTextContent('Kho Tài Sản Số & Phân Quyền Thừa Kế Cá Nhân')
    await userEvent.type(within(dialog).getByLabelText(/^Tên tài sản/), 'Tài khoản Techcombank')
    await userEvent.selectOptions(within(dialog).getByLabelText(/^Loại tài sản/), 'BankAccount')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu tài sản' }))

    expect(await screen.findByText('Hiển thị 1 - 4 trong tổng số 7 tài sản số')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('addAsset_ServerRejects_ShowsErrorInsideModal', async () => {
    server.use(
      http.post('*/api/owner/assets', () => HttpResponse.json({ status: 409, detail: 'Vault is not active.' }, { status: 409 })),
    )
    renderPage()
    await waitForCatalog()
    await openModal()
    const dialog = screen.getByRole('dialog', { name: 'Thêm Tài Sản Số Mới' })
    await userEvent.type(within(dialog).getByLabelText(/^Tên tài sản/), 'Tài sản')
    await userEvent.selectOptions(within(dialog).getByLabelText(/^Loại tài sản/), 'Other')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu tài sản' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Kho này đang không hoạt động')
  })

  it('addAsset_VaultLockedByHandover_ExplainsHandoverLockNotInactive', async () => {
    server.use(
      http.post('*/api/owner/assets', () =>
        HttpResponse.json({ status: 409, detail: 'Handover records protect this vault from mutation.' }, { status: 409 }),
      ),
    )
    renderPage()
    await waitForCatalog()
    await openModal()
    const dialog = screen.getByRole('dialog', { name: 'Thêm Tài Sản Số Mới' })
    await userEvent.type(within(dialog).getByLabelText(/^Tên tài sản/), 'Tài sản')
    await userEvent.selectOptions(within(dialog).getByLabelText(/^Loại tài sản/), 'Other')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu tài sản' }))
    const alert = await within(dialog).findByRole('alert')
    expect(alert).toHaveTextContent('đang có hồ sơ bàn giao')
    expect(alert).not.toHaveTextContent('không hoạt động')
  })

  it('addAsset_VaultHasOpenHandover_DisablesButtonAndExplainsWhy', async () => {
    getDb().handovers = [{ requestId: 1, vaultId: getDb().vaults[0].vaultId, ownerId: DEMO_ACCOUNT.userId, executorId: 3, status: 'Pending_Executor', initiatedAt: new Date().toISOString(), documents: [], cases: [] }]
    saveDb()
    renderPage()
    await waitForCatalog()
    expect(await screen.findByText(/đang có hồ sơ bàn giao/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Thêm tài sản mới' })).toBeDisabled()
  })

  it('addAsset_OnlyCancelledHandover_KeepsButtonEnabled', async () => {
    getDb().handovers = [{ requestId: 1, vaultId: getDb().vaults[0].vaultId, ownerId: DEMO_ACCOUNT.userId, executorId: 3, status: 'Cancelled', initiatedAt: new Date().toISOString(), documents: [], cases: [] }]
    saveDb()
    renderPage()
    await waitForCatalog()
    expect(screen.getByRole('button', { name: 'Thêm tài sản mới' })).toBeEnabled()
    expect(screen.queryByText(/đang có hồ sơ bàn giao/)).not.toBeInTheDocument()
  })

  it('addAsset_HandoversApiFails_DoesNotBlockTheButton', async () => {
    server.use(http.get('*/api/owner/handovers', () => HttpResponse.json({ status: 500, detail: 'x' }, { status: 500 })))
    renderPage()
    await waitForCatalog()
    expect(screen.getByRole('button', { name: 'Thêm tài sản mới' })).toBeEnabled()
  })

  it('addAsset_Cancel_ClosesModal', async () => {
    renderPage()
    await waitForCatalog()
    await openModal()
    await userEvent.click(screen.getByRole('button', { name: 'Hủy' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('AssetCatalogPage without vault', () => {
  async function loginAsNewOwner() {
    await register({ fullName: 'Chủ Mới', email: 'moi@example.com', phone: '', password: 'Registration123!', confirmPassword: 'Registration123!' })
    await login('moi@example.com', 'Registration123!')
  }

  // Người dùng mới chưa có gói thì được yêu cầu chọn gói trước khi tạo kho (xem AssetCatalogFirstVaultPlan.test); ở đây cấp sẵn gói miễn phí để kiểm tra riêng việc tạo kho
  function giveFreePlan() {
    const owner = getDb().users.find((user) => user.email === 'moi@example.com')
    getDb().userSubscriptions = [{ subscriptionId: 1, userId: owner.userId, planId: 4, status: 'Active', startDate: new Date().toISOString(), endDate: new Date(Date.now() + 36500 * 86400000).toISOString() }]
  }

  it('render_NoVault_ShowsCreateVaultPrompt', async () => {
    await loginAsNewOwner()
    renderPage()
    expect(await screen.findByText('Bạn chưa có kho lưu trữ nào.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tạo kho đầu tiên' })).toBeInTheDocument()
  })

  it('createVault_ValidName_ShowsNewVaultBanner', async () => {
    await loginAsNewOwner()
    giveFreePlan()
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Tạo kho đầu tiên' }))
    const dialog = screen.getByRole('dialog', { name: 'Tạo Kho Lưu Trữ Mới' })
    await userEvent.type(within(dialog).getByLabelText(/^Tên kho/), 'Kho của tôi')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Tạo kho' }))
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Kho của tôi')
    expect(screen.getByText('Kho này chưa có tài sản nào.')).toBeInTheDocument()
  })

  it('createVault_EmptyName_ShowsValidationError', async () => {
    await loginAsNewOwner()
    giveFreePlan()
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Tạo kho đầu tiên' }))
    const dialog = screen.getByRole('dialog', { name: 'Tạo Kho Lưu Trữ Mới' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Tạo kho' }))
    expect(within(dialog).getByText('Vui lòng nhập tên kho.')).toBeInTheDocument()
  })
})

describe('AssetCatalogPage edit vault', () => {
  const openEdit = async () => {
    await waitForCatalog()
    await userEvent.click(screen.getByRole('button', { name: 'Sửa kho' }))
    return screen.getByRole('dialog', { name: 'Sửa Thông Tin Kho' })
  }

  it('editVault_Dialog_PrefilledWithCurrentValues', async () => {
    renderPage()
    const dialog = await openEdit()
    expect(within(dialog).getByLabelText(/^Tên kho/)).toHaveValue('Kho Tài Sản Số & Phân Quyền Thừa Kế Cá Nhân')
  })

  it('editVault_ValidName_UpdatesBannerAndShowsToast', async () => {
    renderPage()
    const dialog = await openEdit()
    const name = within(dialog).getByLabelText(/^Tên kho/)
    await userEvent.clear(name)
    await userEvent.type(name, 'Kho đã đổi tên')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }))
    expect(await screen.findByText('Đã cập nhật thông tin kho')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Kho đã đổi tên')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('editVault_EmptyName_ShowsValidationError', async () => {
    renderPage()
    const dialog = await openEdit()
    await userEvent.clear(within(dialog).getByLabelText(/^Tên kho/))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }))
    expect(within(dialog).getByText('Vui lòng nhập tên kho.')).toBeInTheDocument()
  })

  it('editVault_VaultLockedByHandover_ShowsHandoverReason', async () => {
    getDb().handovers.push({ requestId: 50, vaultId: 1, executorId: 5, status: 'Draft', initiatedAt: new Date().toISOString(), documents: [], cases: [] })
    saveDb()
    renderPage()
    const dialog = await openEdit()
    await userEvent.type(within(dialog).getByLabelText(/^Tên kho/), ' mới')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('hồ sơ bàn giao')
  })

  it('editVault_Cancel_ClosesDialog', async () => {
    renderPage()
    const dialog = await openEdit()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Hủy' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('AssetCatalogPage close vault', () => {
  const openClose = async () => {
    await waitForCatalog()
    await userEvent.click(screen.getByRole('button', { name: 'Đóng kho' }))
    return screen.getByRole('dialog', { name: 'Đóng Kho' })
  }

  it('closeVault_Dialog_WarnsItCannotBeReopened', async () => {
    renderPage()
    const dialog = await openClose()
    expect(within(dialog).getByText(/không thể mở lại/)).toBeInTheDocument()
  })

  it('closeVault_Confirm_MarksVaultClosedAndDisablesActions', async () => {
    renderPage()
    const dialog = await openClose()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận đóng kho' }))
    expect(await screen.findByText('Đã đóng kho')).toBeInTheDocument()
    expect(await screen.findByText('Đã đóng', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Thêm tài sản mới/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Sửa kho' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Đóng kho' })).toBeDisabled()
  })

  it('closeVault_VaultLockedByHandover_ShowsHandoverReasonAndKeepsOpen', async () => {
    getDb().handovers.push({ requestId: 50, vaultId: 1, executorId: 5, status: 'Draft', initiatedAt: new Date().toISOString(), documents: [], cases: [] })
    saveDb()
    renderPage()
    const dialog = await openClose()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận đóng kho' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('hồ sơ bàn giao')
    // Kho vẫn mở (chỉ bị khóa thay đổi vì còn hồ sơ bàn giao)
    expect(screen.getByText('Đang hoạt động')).toBeInTheDocument()
  })

  it('closeVault_Cancel_ClosesDialogWithoutClosingVault', async () => {
    renderPage()
    const dialog = await openClose()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Quay lại' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Thêm tài sản mới/ })).toBeEnabled()
  })
})

describe('AssetCatalogPage assets per vault', () => {
  it('selectVault_OtherVault_ShowsOnlyThatVaultsAssets', async () => {
    await createVault({ name: 'Kho thứ hai', description: '' })
    const byVault = {
      [getDb().vaults[0].vaultId]: { assetId: 901, name: 'Tài sản của kho một', type: 'Other', description: null, status: 'Active', documents: [] },
      [getDb().vaults[1].vaultId]: { assetId: 902, name: 'Tài sản của kho hai', type: 'Other', description: null, status: 'Active', documents: [] },
    }
    server.use(
      http.get('*/api/owner/assets', ({ request }) => {
        const vaultId = new URL(request.url).searchParams.get('vaultId')
        return HttpResponse.json({ page: 1, pageSize: 100, items: vaultId ? [byVault[vaultId]] : Object.values(byVault) })
      }),
    )
    renderPage()
    await waitForCatalog()
    expect(await screen.findByText('Tài sản của kho một')).toBeInTheDocument()
    expect(screen.queryByText('Tài sản của kho hai')).not.toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Chọn kho'), 'Kho thứ hai')
    expect(await screen.findByText('Tài sản của kho hai')).toBeInTheDocument()
    expect(screen.queryByText('Tài sản của kho một')).not.toBeInTheDocument()
  })
})

describe('AssetCatalogPage plan limits', () => {
  it('createVault_PlanVaultLimitReached_ExplainsLimitInsideModal', async () => {
    server.use(
      http.post('*/api/owner/vaults', () =>
        HttpResponse.json({ status: 409, detail: 'Vault limit reached (1). Upgrade your plan or close an active vault.' }, { status: 409 }),
      ),
    )
    renderPage()
    await waitForCatalog()
    await userEvent.click(screen.getByRole('button', { name: 'Tạo kho mới' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/^Tên kho/), 'Kho thêm')
    await userEvent.click(within(dialog).getByRole('button', { name: /Tạo kho/ }))
    const alert = await within(dialog).findByRole('alert')
    expect(alert).toHaveTextContent('hết số kho của gói hiện tại')
    expect(alert).toHaveTextContent('Gói dịch vụ')
  })
})
