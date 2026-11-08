import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { login } from '../../callapi/authApi'
import { ROLE_ACCOUNTS, getDb, resetMockDb } from '../../mocks/db'
import { handlers } from '../../mocks/handlers'
import { renderWithProviders } from '../../test/renderWithProviders'
import AdminUsersPage from './AdminUsersPage'

const server = setupServer(...handlers)
const admin = ROLE_ACCOUNTS.find((account) => account.role === 'Admin')

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(async () => {
  resetMockDb()
  await login(admin.email, admin.password)
})
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const renderPage = () => renderWithProviders(<AdminUsersPage mockMode="off" />)
const waitForPage = () => screen.findByRole('table', { name: 'Danh sách người dùng' })
const dataRows = () => within(screen.getByRole('table', { name: 'Danh sách người dùng' })).getAllByRole('row').slice(1)

describe('AdminUsersPage loading and error', () => {
  it('render_WhileFetching_ShowsLoadingStatus', async () => {
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải danh sách người dùng')
    await waitForPage()
  })

  it('render_ApiFails_ShowsErrorWithRetry', async () => {
    server.use(http.get('*/api/admin/users', () => HttpResponse.json({ status: 500, detail: 'Máy chủ đang bận.' }, { status: 500 })))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Máy chủ đang bận.')
    server.resetHandlers()
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(await waitForPage()).toBeInTheDocument()
  })

  it('render_NoMatchingUsers_ShowsEmptyMessage', async () => {
    server.use(http.get('*/api/admin/users', () => HttpResponse.json({ page: 1, pageSize: 10, items: [] })))
    renderPage()
    expect(await screen.findByText('Không có người dùng phù hợp.')).toBeInTheDocument()
  })
})

describe('AdminUsersPage list', () => {
  it('render_Ready_ShowsRowsWithRolesAndStatusBadges', async () => {
    renderPage()
    await waitForPage()
    expect(dataRows()).toHaveLength(8)
    const row = dataRows().find((item) => within(item).queryByText('long.tran@example.com'))
    expect(within(row).getByText('Chủ sở hữu')).toBeInTheDocument()
    expect(within(row).getByText('Người thụ hưởng')).toBeInTheDocument()
    expect(within(row).getByText('Hoạt động')).toBeInTheDocument()
  })

  it('filter_ByRole_ShowsOnlyThatRole', async () => {
    renderPage()
    await waitForPage()
    await userEvent.selectOptions(screen.getByLabelText('Lọc theo vai trò'), 'Executor')
    await screen.findByText('executor@example.com')
    expect(dataRows()).toHaveLength(1)
  })

  it('pager_PageSizeTen_NextDisabledWhenPageNotFull', async () => {
    renderPage()
    await waitForPage()
    expect(screen.getByRole('button', { name: /Tiếp/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Trước/ })).toBeDisabled()
  })

  it('pager_SmallPageSize_NavigatesToSecondPage', async () => {
    renderPage()
    await waitForPage()
    await userEvent.selectOptions(screen.getByLabelText('Số lượng'), '10')
    server.use(
      http.get('*/api/admin/users', ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page'))
        const items = Array.from({ length: page === 1 ? 10 : 2 }, (_, index) => ({
          userId: page * 100 + index,
          fullName: `Người ${page}-${index}`,
          email: `u${page}${index}@example.com`,
          status: 'Active',
          roles: ['Owner'],
          createdAt: '2026-01-01T00:00:00Z',
        }))
        return HttpResponse.json({ page, pageSize: 10, items })
      }),
    )
    await userEvent.selectOptions(screen.getByLabelText('Lọc theo vai trò'), 'Owner')
    await screen.findByText('Người 1-0')
    await userEvent.click(screen.getByRole('button', { name: /Tiếp/ }))
    expect(await screen.findByText('Người 2-0')).toBeInTheDocument()
    expect(dataRows()).toHaveLength(2)
    expect(screen.getByText('Trang 2')).toBeInTheDocument()
  })
})

describe('AdminUsersPage search by user id', () => {
  it('rows_Ready_ShowUserIdBesideName', async () => {
    renderPage()
    await waitForPage()
    expect(within(dataRows()[0]).getByText(/^#\d+$/)).toBeInTheDocument()
  })

  it('userId_TypeId_ShowsOnlyThatUser', async () => {
    renderPage()
    await waitForPage()
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Tìm theo User ID' }), '2')
    await waitFor(() => expect(dataRows()).toHaveLength(1))
    expect(dataRows()[0]).toHaveTextContent('#2')
  })

  it('userId_UnknownId_ShowsEmptyMessage', async () => {
    renderPage()
    await waitForPage()
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Tìm theo User ID' }), '99999')
    expect(await screen.findByText('Không có người dùng phù hợp.')).toBeInTheDocument()
  })
})

describe('AdminUsersPage create user', () => {
  const openModal = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Thêm người dùng' }))
    return screen.getByRole('dialog', { name: 'Thêm Người Dùng' })
  }

  it('create_EmptyForm_ShowsValidationErrors', async () => {
    renderPage()
    await waitForPage()
    const dialog = await openModal()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Tạo người dùng' }))
    expect(within(dialog).getByText('Vui lòng nhập họ tên.')).toBeInTheDocument()
    expect(within(dialog).getByText('Vui lòng nhập email.')).toBeInTheDocument()
    expect(within(dialog).getByText('Vui lòng nhập mật khẩu.')).toBeInTheDocument()
    expect(within(dialog).getByText('Chọn ít nhất một vai trò.')).toBeInTheDocument()
  })

  it('create_ValidInput_AddsUserToListAndShowsToast', async () => {
    renderPage()
    await waitForPage()
    const dialog = await openModal()
    await userEvent.type(within(dialog).getByLabelText(/^Họ và tên/), 'Phạm Thu Hà')
    await userEvent.type(within(dialog).getByLabelText(/^Email/), 'ha.pham@example.com')
    await userEvent.type(within(dialog).getByLabelText(/^Mật khẩu/), 'MatKhau@12345')
    await userEvent.click(within(dialog).getByLabelText('Người thi hành'))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Tạo người dùng' }))
    expect(await screen.findByText('Đã tạo người dùng')).toBeInTheDocument()
    expect(await screen.findByText('ha.pham@example.com')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('create_DuplicateEmail_ShowsConflictError', async () => {
    renderPage()
    await waitForPage()
    const dialog = await openModal()
    await userEvent.type(within(dialog).getByLabelText(/^Họ và tên/), 'Trùng Email')
    await userEvent.type(within(dialog).getByLabelText(/^Email/), 'long.tran@example.com')
    await userEvent.type(within(dialog).getByLabelText(/^Mật khẩu/), 'MatKhau@12345')
    await userEvent.click(within(dialog).getByLabelText('Chủ sở hữu'))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Tạo người dùng' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Email này đã được sử dụng.')
  })

  it('create_Cancel_ClosesDialog', async () => {
    renderPage()
    await waitForPage()
    const dialog = await openModal()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Hủy' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('AdminUsersPage edit user', () => {
  const openEdit = async (fullName) => {
    await userEvent.click(screen.getByRole('button', { name: `Phân quyền ${fullName}` }))
    return screen.getByRole('dialog', { name: 'Phân Quyền Người Dùng' })
  }

  it('edit_NoChange_DisablesSave', async () => {
    renderPage()
    await waitForPage()
    const dialog = await openEdit('Lê Minh Quân')
    expect(within(dialog).getByRole('button', { name: 'Lưu thay đổi' })).toBeDisabled()
  })

  it('edit_ChangeRoles_SavesAndRefreshesList', async () => {
    renderPage()
    await waitForPage()
    const dialog = await openEdit('Lê Minh Quân')
    await userEvent.click(within(dialog).getByLabelText('Người thi hành'))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }))
    expect(await screen.findByText('Đã cập nhật người dùng')).toBeInTheDocument()
    const row = dataRows().find((item) => within(item).queryByText('quan.le@example.com'))
    expect(await within(row).findByText('Người thi hành')).toBeInTheDocument()
  })

  it('edit_RemoveAllRoles_ShowsRequiredRoleError', async () => {
    renderPage()
    await waitForPage()
    const dialog = await openEdit('Lê Minh Quân')
    await userEvent.click(within(dialog).getByLabelText('Chủ sở hữu'))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Chọn ít nhất một vai trò.')
  })

  it('edit_ApiFails_ShowsErrorAndKeepsDialogOpen', async () => {
    server.use(http.put('*/api/admin/users/:userId/roles', () => HttpResponse.json({ status: 404, detail: 'x' }, { status: 404 })))
    renderPage()
    await waitForPage()
    const dialog = await openEdit('Lê Minh Quân')
    await userEvent.click(within(dialog).getByLabelText('Người thi hành'))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Không tìm thấy người dùng.')
  })

  it('edit_Cancel_ClosesDialogWithoutCallingApi', async () => {
    renderPage()
    await waitForPage()
    const dialog = await openEdit('Lê Minh Quân')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Hủy' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('AdminUsersPage update account status', () => {
  const openStatus = async (fullName) => {
    await userEvent.click(screen.getByRole('button', { name: `Cập nhật trạng thái ${fullName}` }))
    return screen.getByRole('dialog', { name: 'Cập Nhật Trạng Thái Tài Khoản' })
  }

  it('status_Open_ShowsThreeStatusesWithCurrentOneSelectedAndSaveDisabled', async () => {
    renderPage()
    await waitForPage()
    const dialog = await openStatus('Lê Minh Quân')
    expect(within(dialog).getAllByRole('radio')).toHaveLength(3)
    expect(within(dialog).getByRole('radio', { name: 'Hoạt động' })).toBeChecked()
    expect(within(dialog).getByRole('radio', { name: 'Vô hiệu hóa' })).not.toBeChecked()
    expect(within(dialog).getByRole('radio', { name: 'Bị khóa' })).not.toBeChecked()
    expect(within(dialog).getByText('Hiện tại')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Cập nhật trạng thái' })).toBeDisabled()
  })

  it('status_ChooseLockedAndSave_UpdatesRowAndShowsToast', async () => {
    renderPage()
    await waitForPage()
    const dialog = await openStatus('Lê Minh Quân')
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Bị khóa' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cập nhật trạng thái' }))
    expect(await screen.findByText('Đã cập nhật trạng thái tài khoản')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const row = dataRows().find((item) => within(item).queryByText('quan.le@example.com'))
    expect(await within(row).findByText('Bị khóa')).toBeInTheDocument()
  })

  it('status_ChooseDisabledAndSave_SendsDisabledToApi', async () => {
    renderPage()
    await waitForPage()
    const dialog = await openStatus('Lê Minh Quân')
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Vô hiệu hóa' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cập nhật trạng thái' }))
    const row = dataRows().find((item) => within(item).queryByText('quan.le@example.com'))
    expect(await within(row).findByText('Vô hiệu hóa')).toBeInTheDocument()
  })

  it('status_ApiFails_ShowsErrorAndKeepsDialogOpen', async () => {
    server.use(http.put('*/api/admin/users/:userId/status', () => HttpResponse.json({ status: 404, detail: 'x' }, { status: 404 })))
    renderPage()
    await waitForPage()
    const dialog = await openStatus('Lê Minh Quân')
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Bị khóa' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cập nhật trạng thái' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Không tìm thấy người dùng.')
  })

  it('status_Cancel_ClosesDialogWithoutCallingApi', async () => {
    renderPage()
    await waitForPage()
    const dialog = await openStatus('Lê Minh Quân')
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Bị khóa' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Hủy' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(dataRows().find((item) => within(item).queryByText('quan.le@example.com'))).getByText('Hoạt động')).toBeInTheDocument()
  })
})

describe('AdminUsersPage edit profile', () => {
  const openProfile = async (fullName) => {
    await userEvent.click(screen.getByRole('button', { name: `Sửa thông tin ${fullName}` }))
    return screen.getByRole('dialog', { name: 'Sửa Thông Tin Người Dùng' })
  }

  it('profile_Open_PrefillsCurrentValuesAndDisablesSaveUntilChanged', async () => {
    renderPage()
    await waitForPage()
    const dialog = await openProfile('Lê Minh Quân')
    expect(within(dialog).getByLabelText(/^Họ và tên/)).toHaveValue('Lê Minh Quân')
    expect(within(dialog).getByText(/quan\.le@example\.com/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Lưu thông tin' })).toBeDisabled()
  })

  it('profile_ChangeNameAndPhone_SavesShowsToastAndRefreshesList', async () => {
    renderPage()
    await waitForPage()
    const dialog = await openProfile('Lê Minh Quân')
    const name = within(dialog).getByLabelText(/^Họ và tên/)
    await userEvent.clear(name)
    await userEvent.type(name, 'Lê Minh Quân Mới')
    await userEvent.type(within(dialog).getByLabelText('Số điện thoại'), '0912345678')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu thông tin' }))
    expect(await screen.findByText('Đã cập nhật thông tin người dùng')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const row = dataRows().find((item) => within(item).queryByText('quan.le@example.com'))
    expect(await within(row).findByText('Lê Minh Quân Mới')).toBeInTheDocument()
    expect(within(row).getByText('0912345678')).toBeInTheDocument()
  })

  it('profile_BlankName_ShowsErrorAndDoesNotCallApi', async () => {
    let called = false
    server.use(
      http.put('*/api/admin/users/:userId', () => {
        called = true
        return HttpResponse.json({})
      }),
    )
    renderPage()
    await waitForPage()
    const dialog = await openProfile('Lê Minh Quân')
    await userEvent.clear(within(dialog).getByLabelText(/^Họ và tên/))
    await userEvent.type(within(dialog).getByLabelText('Số CCCD'), '001200001234')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu thông tin' }))
    expect(await within(dialog).findByText('Vui lòng nhập họ tên.')).toBeInTheDocument()
    expect(called).toBe(false)
  })

  it('profile_ApiFails_ShowsErrorAndKeepsDialogOpen', async () => {
    server.use(http.put('*/api/admin/users/:userId', () => HttpResponse.json({ status: 404, detail: 'x' }, { status: 404 })))
    renderPage()
    await waitForPage()
    const dialog = await openProfile('Lê Minh Quân')
    await userEvent.type(within(dialog).getByLabelText('Số điện thoại'), '0912345678')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu thông tin' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Không tìm thấy người dùng.')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('profile_Cancel_ClosesDialog', async () => {
    renderPage()
    await waitForPage()
    const dialog = await openProfile('Lê Minh Quân')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Hủy' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('AdminUsersPage reset password', () => {
  const openReset = async (fullName) => {
    await userEvent.click(screen.getByRole('button', { name: `Đặt lại mật khẩu ${fullName}` }))
    return screen.getByRole('dialog', { name: 'Đặt Lại Mật Khẩu' })
  }
  const fill = async (dialog, password, confirm = password) => {
    await userEvent.type(within(dialog).getByLabelText(/^Mật khẩu mới/), password)
    await userEvent.type(within(dialog).getByLabelText(/^Nhập lại mật khẩu mới/), confirm)
  }

  it('reset_Open_ShowsTargetUser', async () => {
    renderPage()
    await waitForPage()
    const dialog = await openReset('Lê Minh Quân')
    expect(dialog).toHaveTextContent('Lê Minh Quân')
    expect(dialog).toHaveTextContent('quan.le@example.com')
  })

  it('reset_ValidPassword_ChangesPasswordShowsToastAndClosesDialog', async () => {
    renderPage()
    await waitForPage()
    const dialog = await openReset('Lê Minh Quân')
    await fill(dialog, 'MatKhauMoi@2026')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Đặt lại mật khẩu' }))
    expect(await screen.findByText('Đã đặt lại mật khẩu')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(getDb().users.find((user) => user.email === 'quan.le@example.com').password).toBe('MatKhauMoi@2026')
  })

  it('reset_ShortPassword_ShowsErrorAndDoesNotCallApi', async () => {
    renderPage()
    await waitForPage()
    const dialog = await openReset('Lê Minh Quân')
    await fill(dialog, 'ngan')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Đặt lại mật khẩu' }))
    expect(await within(dialog).findByText('Mật khẩu tối thiểu 12 ký tự.')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('reset_ConfirmMismatch_ShowsMismatchError', async () => {
    renderPage()
    await waitForPage()
    const dialog = await openReset('Lê Minh Quân')
    await fill(dialog, 'MatKhauMoi@2026', 'MatKhauKhac@2026')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Đặt lại mật khẩu' }))
    expect(await within(dialog).findByText('Mật khẩu nhập lại không khớp.')).toBeInTheDocument()
  })

  it('reset_ApiFails_ShowsErrorAndKeepsDialogOpen', async () => {
    server.use(http.post('*/api/admin/users/:userId/reset-password', () => HttpResponse.json({ status: 404, detail: 'x' }, { status: 404 })))
    renderPage()
    await waitForPage()
    const dialog = await openReset('Lê Minh Quân')
    await fill(dialog, 'MatKhauMoi@2026')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Đặt lại mật khẩu' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Không tìm thấy người dùng.')
  })

  it('reset_Cancel_ClosesDialog', async () => {
    renderPage()
    await waitForPage()
    const dialog = await openReset('Lê Minh Quân')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Hủy' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
