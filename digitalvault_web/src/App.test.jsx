import { render, screen } from '@testing-library/react'
import App from './App'

describe('App', () => {
  it('render_Default_ShowsBrandName', () => {
    render(<App />)
    expect(screen.getAllByText('AeternaVault').length).toBeGreaterThan(0)
  })
})

describe('App payment result route', () => {
  afterEach(() => window.history.pushState({}, '', '/'))

  it('route_PaymentResultFromBackendRedirect_ShowsResultInsteadOfBouncingToHome', async () => {
    // BE chuyển khách sau khi thanh toán về /payment-result?status=...&code=...
    window.history.pushState({}, '', '/payment-result?status=Failed&code=261029034201aa9617d677e9ff56318e')
    render(<App />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Thanh toán thất bại' })).toBeInTheDocument()
  })
})
