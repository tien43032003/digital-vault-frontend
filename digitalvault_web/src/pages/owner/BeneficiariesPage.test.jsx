import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { login, register } from '../../callapi/authApi'
import { DEMO_ACCOUNT, getDb, nextId, resetMockDb, saveDb } from '../../mocks/db'
import { handlers } from '../../mocks/handlers'
import { renderWithProviders } from '../../test/renderWithProviders'
import BeneficiariesPage from './BeneficiariesPage'

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(async () => {
  resetMockDb()
  await login(DEMO_ACCOUNT.email, DEMO_ACCOUNT.password)
})
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const renderPage = () => renderWithProviders(<BeneficiariesPage />)
const waitForPage = () => screen.findByRole('heading', { level: 1, name: 'Người thụ hưởng' })

describe('BeneficiariesPage loading and error', () => {
  it('render_WhileFetching_ShowsLoadingStatus', async () => {
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải danh sách người thụ hưởng')
    await waitForPage()
  })

  it('render_ApiFails_ShowsErrorWithRetry', async () => {
    server.use(http.get('*/api/owner/vaults', () => HttpResponse.json({ status: 500, detail: 'Máy chủ đang bận.' }, { status: 500 })))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Máy chủ đang bận.')
    server.resetHandlers()
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(await waitForPage()).toBeInTheDocument()
  })
})

describe('BeneficiariesPage list', () => {
  it('render_Ready_ShowsOneCardPerPersonSortedByName', async () => {
    renderPage()
    await waitForPage()
    const cards = screen.getAllByRole('article')
    expect(cards).toHaveLength(2)
    expect(within(cards[0]).getByRole('heading', { name: 'Nguyễn Thị Mai' })).toBeInTheDocument()
    expect(within(cards[1]).getByRole('heading', { name: 'Trần Bảo Long' })).toBeInTheDocument()
  })

  it('card_Person_ListsAssetsWithAllocationAsLinks', async () => {
    renderPage()
    await waitForPage()
    const card = screen.getByRole('article', { name: 'Trần Bảo Long' })
    const link = within(card).getByRole('link', { name: /Ví Lạnh Trữ Crypto/ })
    expect(link).toHaveAttribute('href', '/owner/assets/1')
    expect(link).toHaveTextContent('40%')
    expect(card).toHaveTextContent('3 tài sản')
  })

  it('card_Actions_EditAndDeleteAreEnabled', async () => {
    renderPage()
    await waitForPage()
    const card = screen.getByRole('article', { name: 'Trần Bảo Long' })
    expect(within(card).getByRole('button', { name: 'Sửa phân quyền' })).toBeEnabled()
    expect(within(card).getByRole('button', { name: 'Xóa' })).toBeEnabled()
  })

  it('edit_ChangeAllocation_UpdatesCardAndShowsToast', async () => {
    renderPage()
    await waitForPage()
    await userEvent.click(within(screen.getByRole('article', { name: 'Trần Bảo Long' })).getByRole('button', { name: 'Sửa phân quyền' }))
    const dialog = screen.getByRole('dialog', { name: 'Sửa Phân Quyền Người Thụ Hưởng' })
    const input = within(dialog).getByLabelText(/Kho Lưu Trữ Kỷ Niệm/)
    await userEvent.clear(input)
    await userEvent.type(input, '30')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }))
    expect(await screen.findByText('Đã cập nhật phân quyền')).toBeInTheDocument()
    const card = screen.getByRole('article', { name: 'Trần Bảo Long' })
    expect(within(card).getByRole('link', { name: /Kho Lưu Trữ Kỷ Niệm.*30%/ })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('remove_Confirm_RemovesPersonAndUpdatesStats', async () => {
    renderPage()
    await waitForPage()
    await userEvent.click(within(screen.getByRole('article', { name: 'Trần Bảo Long' })).getByRole('button', { name: 'Xóa' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Xóa Người Thụ Hưởng' })).getByRole('button', { name: 'Xác nhận xóa' }))
    expect(await screen.findByText('Đã xóa người thụ hưởng')).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'NGƯỜI THỤ HƯỞNG' })).getByText('01')).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Trần Bảo Long' })).not.toBeInTheDocument()
  })

  describe('pending beneficiaries', () => {
    // Quân chỉ có phân bổ chờ xác nhận; Long vừa có phân bổ hiệu lực vừa có thêm một phân bổ chờ xác nhận ở tài sản 4
    function seedPending() {
      seedPendingAssignment(4, 'quan.le@example.com', 30)
      seedPendingAssignment(4, 'long.tran@example.com', 20)
    }

    it('card_OnlyPendingAllocations_ShowsBadgeAndDisablesEditAndRemove', async () => {
      await seedPending()
      renderPage()
      await waitForPage()
      const card = screen.getByRole('article', { name: 'Lê Minh Quân' })
      expect(within(card).getByText('Chờ xác nhận')).toBeInTheDocument()
      expect(within(card).getByRole('button', { name: 'Sửa phân quyền' })).toBeDisabled()
      expect(within(card).getByRole('button', { name: 'Xóa' })).toBeDisabled()
    })

    it('card_ActiveAndPendingMixed_StillAllowsEditingTheActiveOnes', async () => {
      await seedPending()
      renderPage()
      await waitForPage()
      const card = screen.getByRole('article', { name: 'Trần Bảo Long' })
      expect(within(card).getByRole('button', { name: 'Sửa phân quyền' })).toBeEnabled()
      await userEvent.click(within(card).getByRole('button', { name: 'Sửa phân quyền' }))
      const dialog = screen.getByRole('dialog', { name: 'Sửa Phân Quyền Người Thụ Hưởng' })
      expect(within(dialog).queryByLabelText(/Kênh YouTube/)).not.toBeInTheDocument()
      expect(within(dialog).getAllByRole('spinbutton')).toHaveLength(3)
    })

    it('removeModal_ActiveAndPendingMixed_ListsOnlyActiveAllocations', async () => {
      await seedPending()
      renderPage()
      await waitForPage()
      await userEvent.click(within(screen.getByRole('article', { name: 'Trần Bảo Long' })).getByRole('button', { name: 'Xóa' }))
      const list = within(screen.getByRole('dialog', { name: 'Xóa Người Thụ Hưởng' })).getByRole('list', { name: 'Tài sản bị ảnh hưởng' })
      expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    })

    it('stats_PendingPeople_AreStillCountedAsDesignated', async () => {
      await seedPending()
      renderPage()
      await waitForPage()
      expect(within(screen.getByRole('group', { name: 'NGƯỜI THỤ HƯỞNG' })).getByText('03')).toBeInTheDocument()
    })
  })

  it('stats_Ready_CountsPeopleAndAllocatedAssets', async () => {
    renderPage()
    await waitForPage()
    expect(within(screen.getByRole('group', { name: 'NGƯỜI THỤ HƯỞNG' })).getByText('02')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'TÀI SẢN ĐÃ PHÂN BỔ' })).toHaveTextContent('04/06')
  })

  it('search_ByNameIgnoringDiacritics_FiltersCards', async () => {
    renderPage()
    await waitForPage()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Tìm người thụ hưởng' }), 'bao long')
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'Trần Bảo Long' })).toBeInTheDocument()
  })

  it('search_NoMatch_ShowsEmptyMessage', async () => {
    renderPage()
    await waitForPage()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Tìm người thụ hưởng' }), 'zzzz')
    expect(screen.getByText('Không tìm thấy người thụ hưởng phù hợp.')).toBeInTheDocument()
  })
})

describe('BeneficiariesPage vault filter', () => {
  // Kho thứ hai có một tài sản và đúng một người thụ hưởng (Quân) để thấy rõ khác biệt giữa hai kho
  function seedSecondVault() {
    const db = getDb()
    const vaultId = nextId('vault')
    db.vaults.push({ vaultId, ownerId: db.vaults[0].ownerId, name: 'Kho gia đình thứ hai', description: null, status: 'Active' })
    const assetId = nextId('asset')
    db.assets.push({ assetId, vaultId, name: 'Sổ tiết kiệm kho hai', type: 'BankAccount', description: null, status: 'Active', documents: [] })
    const quan = db.users.find((item) => item.email === 'quan.le@example.com')
    db.assignments.push({ assignmentId: nextId('assignment'), assetId, beneficiaryId: quan.userId, allocation: 100, status: 'Active' })
    saveDb()
    return { vaultId, assetId }
  }
  const filter = () => screen.getByRole('combobox', { name: 'Lọc người thụ hưởng theo kho' })

  it('filter_OnlyOneVault_IsHidden', async () => {
    renderPage()
    await waitForPage()
    expect(screen.queryByRole('combobox', { name: 'Lọc người thụ hưởng theo kho' })).not.toBeInTheDocument()
  })

  it('filter_SeveralVaults_ListsEachVaultAndStartsWithTheFirst', async () => {
    seedSecondVault()
    renderPage()
    await waitForPage()
    const options = within(filter()).getAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual(['Kho Tài Sản Số & Phân Quyền Thừa Kế Cá Nhân', 'Kho gia đình thứ hai'])
    expect(screen.getAllByRole('article')).toHaveLength(2)
  })

  it('filter_ChooseOtherVault_ShowsOnlyThatVaultsBeneficiaries', async () => {
    const { vaultId } = seedSecondVault()
    renderPage()
    await waitForPage()
    await userEvent.selectOptions(filter(), String(vaultId))
    const card = await screen.findByRole('article', { name: 'Lê Minh Quân' })
    expect(card).toHaveTextContent('Sổ tiết kiệm kho hai')
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByRole('group', { name: 'NGƯỜI THỤ HƯỞNG' })).toHaveTextContent('01')
  })

  it('filter_VaultWithoutBeneficiaries_ShowsEmptyMessageAndKeepsFilter', async () => {
    const db = getDb()
    const vaultId = nextId('vault')
    db.vaults.push({ vaultId, ownerId: db.vaults[0].ownerId, name: 'Kho trống', description: null, status: 'Active' })
    saveDb()
    renderPage()
    await waitForPage()
    await userEvent.selectOptions(filter(), String(vaultId))
    expect(await screen.findByText('Kho này chưa có người thụ hưởng nào.')).toBeInTheDocument()
    expect(filter()).toBeInTheDocument()
  })
})

describe('BeneficiariesPage without data', () => {
  it('render_NewOwnerWithoutAssets_ShowsEmptyStateAndDisabledAdd', async () => {
    await register({ fullName: 'Chủ Mới', email: 'moi@example.com', phone: '', password: 'Registration123!', confirmPassword: 'Registration123!' })
    await login('moi@example.com', 'Registration123!')
    renderPage()
    expect(await screen.findByText('Bạn chưa có người thụ hưởng nào.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Thêm người thụ hưởng' })).toBeDisabled()
  })
})

// Seed một phân bổ đang chờ xác nhận (BE hiện chỉ định xong là Active, nhưng FE vẫn xử lý Pending nếu BE trả về)
function seedPendingAssignment(assetId, email, allocation) {
  const db = getDb()
  const user = db.users.find((item) => item.email === email)
  db.assignments.push({ assignmentId: nextId('assignment'), assetId, beneficiaryId: user.userId, allocation, status: 'Pending' })
  saveDb()
}

describe('BeneficiariesPage add beneficiary', () => {
  const openModal = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Thêm người thụ hưởng' }))
    return screen.getByRole('dialog', { name: 'Thêm Người Thụ Hưởng' })
  }

  it('addModal_AssetSelect_OnlyListsAssetsWithRemainingAllocation', async () => {
    renderPage()
    await waitForPage()
    const dialog = await openModal()
    const options = within(within(dialog).getByLabelText(/^Tài sản/)).getAllByRole('option').map((o) => o.textContent)
    expect(options).toHaveLength(3)
    expect(options[1]).toMatch(/Kênh YouTube/)
    expect(options[2]).toMatch(/Ledger/)
  })

  it('addModal_EmptyForm_ShowsValidationErrors', async () => {
    renderPage()
    await waitForPage()
    const dialog = await openModal()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Chỉ định' }))
    expect(within(dialog).getByText('Vui lòng chọn tài sản.')).toBeInTheDocument()
    expect(within(dialog).getByText('Vui lòng nhập email.')).toBeInTheDocument()
    expect(within(dialog).getByText('Vui lòng nhập tỷ lệ phân bổ.')).toBeInTheDocument()
  })

  it('addModal_ValidForm_ClosesAndShowsNewPerson', async () => {
    renderPage()
    await waitForPage()
    const dialog = await openModal()
    await userEvent.selectOptions(within(dialog).getByLabelText(/^Tài sản/), '4')
    await userEvent.type(within(dialog).getByLabelText(/^Email người thụ hưởng/), 'quan.le@example.com')
    await userEvent.type(within(dialog).getByLabelText(/^Tỷ lệ phân bổ/), '100')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Chỉ định' }))

    expect(await screen.findByRole('article', { name: 'Lê Minh Quân' })).toHaveTextContent('100%')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(3)
  })

  it('addModal_UnregisteredEmail_ShowsServerErrorInsideDialog', async () => {
    renderPage()
    await waitForPage()
    const dialog = await openModal()
    await userEvent.selectOptions(within(dialog).getByLabelText(/^Tài sản/), '4')
    await userEvent.type(within(dialog).getByLabelText(/^Email người thụ hưởng/), 'khong.co@example.com')
    await userEvent.type(within(dialog).getByLabelText(/^Tỷ lệ phân bổ/), '10')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Chỉ định' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Không tìm thấy tài khoản đang hoạt động với email này.')
  })

  it('addModal_AllocationOverRemaining_ShowsRemainingError', async () => {
    renderPage()
    await waitForPage()
    let dialog = await openModal()
    await userEvent.selectOptions(within(dialog).getByLabelText(/^Tài sản/), '6')
    await userEvent.type(within(dialog).getByLabelText(/^Email người thụ hưởng/), 'long.tran@example.com')
    await userEvent.type(within(dialog).getByLabelText(/^Tỷ lệ phân bổ/), '70')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Chỉ định' }))
    // Đợi modal đóng và danh sách tải lại xong rồi mới mở modal lần hai
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitForPage()

    dialog = await openModal()
    await userEvent.selectOptions(within(dialog).getByLabelText(/^Tài sản/), '6')
    await userEvent.type(within(dialog).getByLabelText(/^Email người thụ hưởng/), 'mai.nguyen@example.com')
    await userEvent.type(within(dialog).getByLabelText(/^Tỷ lệ phân bổ/), '40')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Chỉ định' }))
    expect(within(dialog).getByText('Chỉ còn 30% có thể phân bổ.')).toBeInTheDocument()
  })

  it('addModal_Cancel_ClosesDialog', async () => {
    renderPage()
    await waitForPage()
    await openModal()
    await userEvent.click(screen.getByRole('button', { name: 'Hủy' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
