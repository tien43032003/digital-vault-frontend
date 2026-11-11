import axiosClient from './axiosClient'
import { getAllPages } from './pagedList'
// API cổng Người thụ hưởng của BE (role Beneficiary): xác thực OTP, tài sản thụ hưởng, hồ sơ bàn giao và biên nhận.
// ---- Cổng xác thực OTP ----
// Yêu cầu BE gửi mã OTP; trả OtpChallenge { challengeId, expiresAt } (mock trả thêm mockCode để demo)
export async function requestBeneficiaryOtp() {
	const { data } = await axiosClient.post('/beneficiary/otp/request')
	return data
}
// Xác minh mã OTP theo challengeId (OtpInput { challengeId, code })
// Trả về phản hồi của BE (nếu có kèm hạn phiên như expiresAt/expiresInSeconds thì cổng OTP dùng làm hạn phiên)
export async function verifyBeneficiaryOtp(challengeId, code) {
	const { data } = await axiosClient.post('/beneficiary/otp/verify', { challengeId, code: String(code).trim() })
	return data
}

// Hỏi BE xem phiên OTP còn hiệu lực không (một request nhẹ vào dữ liệu thụ hưởng); 403/428 nghĩa là cần xác thực lại
export async function checkBeneficiaryOtpSession() {
	await axiosClient.get('/beneficiary/assets', { params: { page: 1, pageSize: 1 } })
}
// ---- Tài sản thụ hưởng ----
// Danh sách InheritanceDto { handoverId, allocation, asset: AssetDto }
export async function getInheritedAssets() {
	return getAllPages('/beneficiary/assets')
}
// Chi tiết một tài sản thụ hưởng (InheritanceDto)
export async function getInheritedAsset(assetId) {
	const { data } = await axiosClient.get(`/beneficiary/assets/${assetId}`)
	return data
}
// Nội dung giấy tờ của tài sản; header X-Signature-Valid cho biết chữ ký rời có hợp lệ không
export async function downloadInheritedAssetDocument(assetId, documentId) {
	const response = await axiosClient.get(`/beneficiary/assets/${assetId}/documents/${documentId}/content`, { responseType: 'blob' })
	return { blob: response.data, signatureValid: response.headers?.['x-signature-valid'] === 'true' }
}
// ---- Tiến trình bàn giao ----
// Danh sách CaseDto { handoverId, assetId, beneficiaryId, status }
export async function getBeneficiaryHandovers() {
	return getAllPages('/beneficiary/handovers')
}
export async function getBeneficiaryHandover(handoverId) {
	const { data } = await axiosClient.get(`/beneficiary/handovers/${handoverId}`)
	return data
}
// Giấy tờ của hồ sơ bàn giao: DocumentDto[]
export async function getBeneficiaryHandoverDocuments(handoverId) {
	const { data } = await axiosClient.get(`/beneficiary/handovers/${handoverId}/documents`)
	return Array.isArray(data) ? data : (data?.items ?? [])
}
export async function downloadBeneficiaryHandoverDocument(handoverId, documentId) {
	const response = await axiosClient.get(`/beneficiary/handovers/${handoverId}/documents/${documentId}/content`, { responseType: 'blob' })
	return { blob: response.data, signatureValid: response.headers?.['x-signature-valid'] === 'true' }
}
// ---- Biên nhận ----
// ReceiptDto của hồ sơ; BE trả 404 khi chưa xác nhận nên đổi thành null
export async function getHandoverReceipt(handoverId) {
	try {
		const { data } = await axiosClient.get(`/beneficiary/handovers/${handoverId}/receipt`)
		return data || null
	} catch (error) {
		if (error?.status === 404) return null
		throw error
	}
}
// Xác nhận đã nhận tài sản: multipart File (tệp xác nhận) + Signature (chữ ký số rời) bắt buộc, Note tuỳ chọn; trả ReceiptDto
export async function confirmHandoverReceipt(handoverId, { note, file, signature }) {
	const form = new FormData()
	form.append('File', file)
	form.append('Signature', signature)
	const trimmed = note?.trim()
	if (trimmed) form.append('Note', trimmed)
	const { data } = await axiosClient.post(`/beneficiary/handovers/${handoverId}/receipt`, form)
	return data
}
