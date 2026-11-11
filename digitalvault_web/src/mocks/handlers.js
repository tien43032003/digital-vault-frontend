import { http, HttpResponse } from 'msw'
import { getDb, nextId, saveDb, setSessionUserId } from './db'
import { adminHandlers } from './adminHandlers'
import { chatHandlers } from './chatHandlers'
import { extraHandlers, passwordHandlers } from './extraHandlers'
import { paymentHandlers } from './paymentHandlers'
import { notify } from './notifications'
import { legalHandlers } from './legalHandlers'
import { fieldOf, hasUnknownFormFields, isValidDocument, isValidSignature } from './formFiles'
import { executorRoute, hasUnknownFields, isBlank, ownerRoute, problem, route } from './helpers'
import { parseAllocation, parseAssetUpdate } from './assetInput'

const vaultDto = ({ vaultId, name, description, status }) => ({ vaultId, name, description, status })
// BE chỉ trả giấy tờ còn hiệu lực (Status Active), giấy tờ đã thu hồi bị ẩn
const activeDocuments = (documents) => documents.filter((item) => !item.revoked)

const assetDto = ({ assetId, name, type, description, status, documents }) => ({
  assetId,
  name,
  type,
  description,
  status,
  documents: activeDocuments(documents),
})

function ownedVaults(db, userId) {
  return db.vaults.filter((vault) => vault.ownerId === userId)
}

function ownedAssets(db, userId) {
  const vaultIds = ownedVaults(db, userId).map((vault) => vault.vaultId)
  return db.assets.filter((asset) => vaultIds.includes(asset.vaultId))
}

const EDITABLE_HANDOVER_STATUSES = ['Draft', 'Rejected', 'Additional_Info']

const handoverDocumentDto = (document) => ({
  documentId: document.documentId,
  fileName: document.fileName,
  fileType: document.fileType,
  isEncrypted: true,
  signatureValid: document.hasSignature ? true : null,
})

const handoverDto = (request) => ({
  requestId: request.requestId,
  vaultId: request.vaultId,
  requestType: 'Inheritance',
  status: request.status,
  initiatedAt: request.initiatedAt,
  documents: request.documents.map(handoverDocumentDto),
  cases: request.cases,
  executorId: request.executorId,
})

// Hồ sơ nhìn từ Owner: BE thêm tên Executor và, với hồ sơ bị từ chối, lý do và thời điểm từ chối
const ownerHandoverDto = (request) => {
  const db = getDb()
  const executorName = db.users.find((user) => user.userId === request.executorId)?.fullName ?? db.executors.find((item) => item.executorId === request.executorId)?.fullName ?? null
  const declined = request.status === 'Declined' ? { declineReason: request.declineReason ?? null, declinedAt: request.declinedAt ?? null } : {}
  return { ...handoverDto(request), executorName, ...declined }
}

// Hồ sơ của chính Executor đang đăng nhập (hồ sơ của người khác coi như không tồn tại)
const ownHandover = (userId, requestId) => getDb().handovers.find((item) => item.requestId === Number(requestId) && item.executorId === userId)

async function readForm(request) {
  try {
    return await request.formData()
  } catch {
    return null
  }
}

// Nộp giấy chứng tử hoặc bằng chứng: File bắt buộc, Signature tuỳ chọn, chỉ khi hồ sơ còn sửa được
async function uploadHandoverDocument({ userId, params, request }, purpose) {
  const handover = ownHandover(userId, params.requestId)
  if (!handover) return problem(404, 'Handover request not found.')
  if (!EDITABLE_HANDOVER_STATUSES.includes(handover.status)) return problem(409, 'Documents are editable only before legal submission.')
  const form = await readForm(request)
  if (!form) return problem(400, 'Request must be multipart/form-data.')
  if (hasUnknownFormFields(form, ['File', 'Signature'])) return problem(400, 'Only File and optional Signature are accepted.')
  const file = fieldOf(form, 'File')
  if (!isValidDocument(file)) return problem(400, 'File must be 1 byte to 10 MB and a PDF, PNG, JPEG or text file.')
  const signature = fieldOf(form, 'Signature')
  if (signature !== null && !isValidSignature(signature)) return problem(400, 'Invalid detached signature size.')
  const document = { documentId: nextId('document'), fileName: file.name, fileType: file.type, purpose, hasSignature: signature !== null }
  handover.documents.push(document)
  saveDb()
  return HttpResponse.json(handoverDocumentDto(document))
}

// BE chặn mọi thao tác sửa của Owner trên kho còn hồ sơ bàn giao chưa hủy
// Mỗi phân bổ Active của tài sản Active trong kho là một case của hồ sơ bàn giao
function draftCases(db, vaultId) {
  const assetIds = db.assets.filter((asset) => asset.vaultId === vaultId && asset.status === 'Active').map((asset) => asset.assetId)
  return db.assignments
    .filter((assignment) => assignment.status === 'Active' && assetIds.includes(assignment.assetId))
    .map((assignment) => ({ handoverId: nextId('handoverCase'), assetId: assignment.assetId, beneficiaryId: assignment.beneficiaryId, status: 'Pending' }))
}

// Như Ready(v) của BE: kho phải có tài sản Active, mỗi tài sản đủ giấy tờ và đúng 100% phân bổ Active
function vaultNotReady(db, vaultId) {
  const assets = db.assets.filter((asset) => asset.vaultId === vaultId && asset.status === 'Active')
  return (
    assets.length === 0 ||
    assets.some((asset) => {
      const total = db.assignments.filter((item) => item.assetId === asset.assetId && item.status === 'Active').reduce((sum, item) => sum + item.allocation, 0)
      return Math.round(total * 100) / 100 !== 100 || activeDocuments(asset.documents).length === 0
    })
  )
}

const HANDOVER_LOCK = 'Handover records protect this vault from mutation.'
// Như BE: hồ sơ chưa hủy và chưa bị Executor từ chối thì khóa kho
const vaultLocked = (db, vaultId) => db.handovers.some((item) => item.vaultId === vaultId && !['Cancelled', 'Declined'].includes(item.status))

function assignmentDto(db, assignment) {
  const user = db.users.find((u) => u.userId === assignment.beneficiaryId)
  return {
    assignmentId: assignment.assignmentId,
    assetId: assignment.assetId,
    beneficiaryId: assignment.beneficiaryId,
    fullName: user?.fullName ?? '',
    allocation: assignment.allocation,
    status: assignment.status,
  }
}

function beneficiaryDto(db, assignment) {
  const user = db.users.find((u) => u.userId === assignment.beneficiaryId)
  return {
    assetId: assignment.assetId,
    beneficiaryId: assignment.beneficiaryId,
    fullName: user?.fullName ?? '',
    allocation: assignment.allocation,
    status: assignment.status,
  }
}

// Mô phỏng cặp token của BE: access token ngắn hạn, refresh token 7 ngày và lưu lại để xoay vòng
function issueTokens(userId) {
  const db = getDb()
  const accessToken = `mock-access.${userId}.${crypto.randomUUID()}`
  const refreshToken = `mock-refresh.${crypto.randomUUID()}`
  db.refreshTokens[refreshToken] = { userId, revoked: false }
  saveDb()
  return {
    accessToken,
    tokenType: 'Bearer',
    expiresIn: 900,
    refreshToken,
    refreshTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  }
}

const TWO_FACTOR_TTL_MS = 5 * 60 * 1000
const TWO_FACTOR_COOLDOWN_MS = 60 * 1000
const MAX_TWO_FACTOR_ATTEMPTS = 5

// Tạo challenge mới (32 ký tự hex như BE) và mã 6 số
function startTwoFactorChallenge(userId) {
  const db = getDb()
  const challengeId = crypto.randomUUID().replace(/-/g, '')
  const code = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')
  const now = Date.now()
  db.twoFactorChallenges[challengeId] = { userId, code, expiresAt: now + TWO_FACTOR_TTL_MS, attempts: 0, lastSentAt: now }
  saveDb()
  return {
    challengeId,
    method: 'Email',
    expiresAt: new Date(now + TWO_FACTOR_TTL_MS).toISOString(),
    requiresTwoFactor: true,
    mockCode: code,
  }
}

const coreHandlers = [
  http.post(
    '*/api/auth/register',
    route(
      ({ body }) => {
        const allowed = ['fullName', 'email', 'password', 'confirmPassword', 'phone', 'identityNumber']
        if (hasUnknownFields(body, allowed)) return problem(400, 'Request contains fields outside the contract.')
        const { fullName, email, password, confirmPassword, phone, identityNumber } = body ?? {}
        if (isBlank(fullName) || fullName.trim().length > 100) return problem(400, 'Full name is required (max 100).')
        if (isBlank(email) || !/^\S+@\S+\.\S+$/.test(email.trim())) return problem(400, 'Email is invalid.')
        if (typeof password !== 'string' || password.length < 12 || password.length > 1024) {
          return problem(400, 'Password must be 12 to 1024 characters.')
        }
        if (password !== confirmPassword) return problem(400, 'Passwords do not match.')
        // Phone và IdentityNumber (CCCD) là trường tuỳ chọn, tối đa 20 ký tự như BE
        if (typeof phone === 'string' && phone.length > 20) return problem(400, 'Phone is too long (max 20).')
        if (typeof identityNumber === 'string' && identityNumber.length > 20) {
          return problem(400, 'IdentityNumber is too long (max 20).')
        }

        const db = getDb()
        const normalizedEmail = email.trim().toLowerCase()
        if (db.users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
          return problem(409, 'Email is already registered.')
        }
        const user = {
          userId: nextId('user'),
          fullName: fullName.trim(),
          email: normalizedEmail,
          phone: isBlank(phone) ? null : phone.trim(),
          identityNumber: isBlank(identityNumber) ? null : identityNumber.trim(),
          password,
          roles: ['Owner'],
        }
        db.users.push(user)
        saveDb()
        return HttpResponse.json(
          {
            userId: user.userId,
            fullName: user.fullName,
            email: user.email,
            phone: user.phone,
            identityNumber: user.identityNumber,
            roles: user.roles,
          },
          { status: 201 },
        )
      },
      { auth: false },
    ),
  ),

  http.post(
    '*/api/auth/login',
    route(
      ({ body }) => {
        const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
        const user = getDb().users.find((u) => u.email.toLowerCase() === email)
        if (!user || user.password !== body?.password) {
          return problem(401, 'Invalid email or password.')
        }
        // Tài khoản bật xác thực hai lớp thì chưa cấp token: trả 202 kèm challenge (mockCode chỉ có ở mock để demo không cần email thật)
        if (getDb().security[user.userId]?.twoFactorEnabled) {
          return HttpResponse.json(startTwoFactorChallenge(user.userId), { status: 202 })
        }
        setSessionUserId(user.userId)
        return HttpResponse.json({ userId: user.userId, roles: user.roles, ...issueTokens(user.userId) })
      },
      { auth: false },
    ),
  ),

  // Đổi cặp token cũ lấy cặp mới; refresh token đã dùng bị thu hồi (xoay vòng như BE)
  http.post(
    '*/api/auth/refresh-token',
    route(
      ({ body }) => {
        if (hasUnknownFields(body, ['refreshToken']) || isBlank(body?.refreshToken)) return problem(400, 'RefreshToken is required.')
        const { refreshToken } = body
        const stored = getDb().refreshTokens[refreshToken]
        if (!stored || stored.revoked) return problem(401, 'Refresh token is invalid or revoked.')
        stored.revoked = true
        return HttpResponse.json(issueTokens(stored.userId))
      },
      { auth: false },
    ),
  ),

  http.post(
    '*/api/auth/2fa/verify',
    route(
      ({ body }) => {
        if (hasUnknownFields(body, ['challengeId', 'code']) || !/^[0-9a-f]{32}$/.test(body?.challengeId ?? '') || !/^\d{6}$/.test(body?.code ?? '')) {
          return problem(400, 'Challenge and a 6 digit code are required.')
        }
        const db = getDb()
        const challenge = db.twoFactorChallenges[body.challengeId]
        if (!challenge || challenge.expiresAt < Date.now() || challenge.attempts >= MAX_TWO_FACTOR_ATTEMPTS) {
          return problem(400, 'Invalid or expired code.')
        }
        if (challenge.code !== body.code) {
          challenge.attempts += 1
          saveDb()
          return problem(400, 'Invalid or expired code.')
        }
        delete db.twoFactorChallenges[body.challengeId]
        const user = db.users.find((item) => item.userId === challenge.userId)
        setSessionUserId(user.userId)
        return HttpResponse.json({ userId: user.userId, roles: user.roles, ...issueTokens(user.userId) })
      },
      { auth: false },
    ),
  ),

  // Gửi lại mã: chờ 60 giây giữa hai lần, challenge cũ bị hủy
  http.post(
    '*/api/auth/2fa/resend',
    route(
      ({ body }) => {
        if (hasUnknownFields(body, ['challengeId']) || !/^[0-9a-f]{32}$/.test(body?.challengeId ?? '')) return problem(400, 'ChallengeId is required.')
        const db = getDb()
        const challenge = db.twoFactorChallenges[body.challengeId]
        if (!challenge || challenge.expiresAt < Date.now()) return problem(400, 'Invalid or expired challenge.')
        if (Date.now() - challenge.lastSentAt < TWO_FACTOR_COOLDOWN_MS) return problem(429, 'Wait before requesting another code.')
        delete db.twoFactorChallenges[body.challengeId]
        return HttpResponse.json(startTwoFactorChallenge(challenge.userId))
      },
      { auth: false },
    ),
  ),

  http.get(
    '*/api/auth/me',
    route(({ userId }) => {
      const user = getDb().users.find((item) => item.userId === userId)
      return HttpResponse.json({ userId, fullName: user.fullName, email: user.email, roles: user.roles, status: 'Active' })
    }),
  ),

  http.post(
    '*/api/auth/logout',
    route(() => {
      setSessionUserId(null)
      return new HttpResponse(null, { status: 204 })
    }),
  ),

  http.get(
    '*/api/owner/vaults',
    ownerRoute(({ userId }) => HttpResponse.json(ownedVaults(getDb(), userId).map(vaultDto))),
  ),

  http.get(
    '*/api/owner/vaults/:vaultId',
    ownerRoute(({ userId, params }) => {
      const vault = ownedVaults(getDb(), userId).find((v) => v.vaultId === Number(params.vaultId))
      return vault ? HttpResponse.json(vaultDto(vault)) : problem(404, 'Vault not found.')
    }),
  ),

  http.post(
    '*/api/owner/vaults',
    ownerRoute(({ userId, body }) => {
      if (hasUnknownFields(body, ['name', 'description'])) return problem(400, 'Request contains fields outside the contract.')
      if (isBlank(body?.name) || body.name.trim().length > 100) return problem(400, 'Name is required (max 100).')
      if (typeof body.description === 'string' && body.description.length > 4000) {
        return problem(400, 'Description is too long (max 4000).')
      }
      const db = getDb()
      const vault = {
        vaultId: nextId('vault'),
        ownerId: userId,
        name: body.name.trim(),
        description: body.description ?? null,
        status: 'Active',
      }
      db.vaults.push(vault)
      saveDb()
      return HttpResponse.json(vaultDto(vault), {
        status: 201,
        headers: { Location: `/api/owner/vaults/${vault.vaultId}` },
      })
    }),
  ),

  // Sửa kho: như BE (UpdateVault) thì kho phải đang hoạt động và không có hồ sơ bàn giao chưa hủy
  http.put(
    '*/api/owner/vaults/:vaultId',
    ownerRoute(({ userId, params, body }) => {
      if (hasUnknownFields(body, ['name', 'description'])) return problem(400, 'Request contains fields outside the contract.')
      if (isBlank(body?.name) || body.name.trim().length > 100) return problem(400, 'Name is required (max 100).')
      if (typeof body.description === 'string' && body.description.length > 4000) return problem(400, 'Description is too long (max 4000).')
      const db = getDb()
      const vault = ownedVaults(db, userId).find((item) => item.vaultId === Number(params.vaultId))
      if (!vault) return problem(404, 'Vault not found.')
      if (vault.status !== 'Active' || vaultLocked(db, vault.vaultId)) return problem(409, 'Vault is inactive or has a protected handover record.')
      vault.name = body.name.trim()
      vault.description = body.description?.trim() || null
      saveDb()
      return HttpResponse.json(vaultDto(vault))
    }),
  ),

  http.post(
    '*/api/owner/vaults/:vaultId/close',
    ownerRoute(({ userId, params }) => {
      const db = getDb()
      const vault = ownedVaults(db, userId).find((item) => item.vaultId === Number(params.vaultId))
      if (!vault) return problem(404, 'Vault not found.')
      if (vault.status !== 'Active' || vaultLocked(db, vault.vaultId)) return problem(409, 'Vault is inactive or has a protected handover record.')
      vault.status = 'Closed'
      saveDb()
      return new HttpResponse(null, { status: 204 })
    }),
  ),

  http.get(
    '*/api/owner/assets',
    ownerRoute(({ userId, request }) => {
      const vaultId = new URL(request.url).searchParams.get('vaultId')
      const assets = ownedAssets(getDb(), userId).filter((asset) => vaultId === null || asset.vaultId === Number(vaultId))
      return HttpResponse.json(assets.map(assetDto))
    }),
  ),

  http.get(
    '*/api/owner/assets/:assetId',
    ownerRoute(({ userId, params }) => {
      const asset = ownedAssets(getDb(), userId).find((a) => a.assetId === Number(params.assetId))
      return asset ? HttpResponse.json(assetDto(asset)) : problem(404, 'Asset not found.')
    }),
  ),

  http.post(
    '*/api/owner/assets',
    ownerRoute(({ userId, body }) => {
      if (hasUnknownFields(body, ['vaultId', 'name', 'type', 'description'])) {
        return problem(400, 'Request contains fields outside the contract.')
      }
      if (!Number.isInteger(body?.vaultId) || body.vaultId < 1) return problem(400, 'VaultId is required.')
      if (isBlank(body.name) || body.name.trim().length > 100) return problem(400, 'Name is required (max 100).')
      // AssetType là varchar(50) nên BE chỉ nhận ký tự ASCII in được
      if (typeof body.type !== 'string' || !/^[\x20-\x7E]{1,50}$/.test(body.type)) {
        return problem(400, 'Type must be 1-50 ASCII characters.')
      }
      if (typeof body.description === 'string' && body.description.length > 4000) {
        return problem(400, 'Description is too long (max 4000).')
      }
      const db = getDb()
      const vault = ownedVaults(db, userId).find((v) => v.vaultId === body.vaultId)
      if (!vault) return problem(404, 'Vault not found.')
      if (vault.status !== 'Active') return problem(409, 'Vault is not active.')

      const asset = {
        assetId: nextId('asset'),
        vaultId: vault.vaultId,
        name: body.name.trim(),
        type: body.type,
        description: body.description ?? null,
        status: 'Active',
        documents: [],
      }
      db.assets.push(asset)
      saveDb()
      return HttpResponse.json(assetDto(asset), {
        status: 201,
        headers: { Location: `/api/owner/assets/${asset.assetId}` },
      })
    }),
  ),

  // Upload giấy tờ của Owner: chỉ nhận File + Signature (bắt buộc) và BeneficiaryId (tuỳ chọn), như BE.
  // Giấy chứng tử không còn qua endpoint này (Executor nộp trong hồ sơ bàn giao).
  http.post(
    '*/api/owner/assets/:assetId/documents',
    ownerRoute(async ({ userId, params, request }) => {
      const db = getDb()
      const asset = ownedAssets(db, userId).find((a) => a.assetId === Number(params.assetId))
      if (!asset) return problem(404, 'Asset not found.')
      if (vaultLocked(db, asset.vaultId)) return problem(409, HANDOVER_LOCK)

      let form
      try {
        form = await request.formData()
      } catch {
        return problem(400, 'Request must be multipart/form-data.')
      }
      const allowedFields = ['file', 'signature', 'beneficiaryid']
      if ([...form.keys()].some((key) => !allowedFields.includes(key.toLowerCase()))) {
        return problem(400, "Only File, Signature and optional BeneficiaryId are accepted. Legal evidence belongs to the assigned Executor's handover.")
      }
      const field = (name) => [...form.entries()].find(([key]) => key.toLowerCase() === name)?.[1] ?? null
      const isFile = (value) => value !== null && typeof value === 'object' && typeof value.size === 'number'
      const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'text/plain']

      const file = field('file')
      if (!isFile(file) || file.size <= 0 || file.size > 10 * 1024 * 1024 || !allowedTypes.includes(file.type)) {
        return problem(400, 'File must be 1 byte to 10 MB and a PDF, PNG, JPEG or text file.')
      }
      const signature = field('signature')
      if (!isFile(signature) || signature.size <= 0 || signature.size > 16384) return problem(400, 'Invalid detached signature size.')

      const rawBeneficiary = field('beneficiaryid')
      if (rawBeneficiary !== null) {
        const beneficiaryId = Number(rawBeneficiary)
        if (!Number.isInteger(beneficiaryId) || beneficiaryId < 1) return problem(400, 'BeneficiaryId must be a positive integer.')
        const assigned = db.assignments.some((a) => a.assetId === asset.assetId && a.status === 'Active' && a.beneficiaryId === beneficiaryId)
        if (!assigned) return problem(409, 'Choose a beneficiary currently assigned to this asset.')
      }

      const document = { documentId: nextId('document'), fileName: file.name, fileType: file.type, isEncrypted: true, signatureValid: null }
      asset.documents.push(document)
      saveDb()
      return HttpResponse.json(document)
    }),
  ),

  http.get(
    '*/api/owner/beneficiaries',
    ownerRoute(({ userId, request }) => {
      const db = getDb()
      const assets = ownedAssets(db, userId)
      const assetIdParam = new URL(request.url).searchParams.get('assetId')
      if (assetIdParam !== null && !assets.some((a) => a.assetId === Number(assetIdParam))) {
        return problem(404, 'Asset not found.')
      }
      const assetIds = assets.map((a) => a.assetId)
      const list = db.assignments
        .filter((a) => assetIds.includes(a.assetId))
        .filter((a) => assetIdParam === null || a.assetId === Number(assetIdParam))
        .map((a) => beneficiaryDto(db, a))
      return HttpResponse.json(list)
    }),
  ),

  http.post(
    '*/api/owner/assets/:assetId/beneficiaries',
    ownerRoute(({ userId, params, body }) => {
      if (hasUnknownFields(body, ['email', 'allocation'])) return problem(400, 'Request contains fields outside the contract.')
      const db = getDb()
      const asset = ownedAssets(db, userId).find((a) => a.assetId === Number(params.assetId))
      if (!asset) return problem(404, 'Asset not found.')
      if (vaultLocked(db, asset.vaultId)) return problem(409, HANDOVER_LOCK)

      const allocation = body?.allocation ?? 100
      const hasTwoDecimals = Number.isFinite(allocation) && Math.round(allocation * 100) / 100 === allocation
      if (!hasTwoDecimals || allocation < 0.01 || allocation > 100) {
        return problem(400, 'Allocation must be between 0.01 and 100 with at most two decimals.')
      }
      const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
      if (!email) return problem(400, 'Email is required.')
      const target = db.users.find((u) => u.email.toLowerCase() === email)
      if (!target) return problem(404, 'No active account with this email.')
      if (target.userId === userId) return problem(400, 'You cannot assign yourself as beneficiary.')

      // Như BE: người đã được chỉ định (Active hoặc Pending) không chỉ định lại; chỉ tỷ lệ Active được cộng vào tổng
      const onAsset = db.assignments.filter((a) => a.assetId === asset.assetId)
      if (onAsset.some((a) => a.beneficiaryId === target.userId && ['Active', 'Pending'].includes(a.status))) {
        return problem(409, 'This user is already a pending or active beneficiary of the asset.')
      }
      const total = onAsset.filter((a) => a.status === 'Active').reduce((sum, a) => sum + a.allocation, 0)
      if (Math.round((total + allocation) * 100) / 100 > 100) return problem(409, 'Total active beneficiary allocation cannot exceed 100 percent.')

      const assignment = { assignmentId: nextId('assignment'), assetId: asset.assetId, beneficiaryId: target.userId, allocation, status: 'Active' }
      db.assignments.push(assignment)
      if (!target.roles.includes('Beneficiary')) target.roles.push('Beneficiary')
      saveDb()
      return HttpResponse.json(beneficiaryDto(db, assignment), { status: 201 })
    }),
  ),

  // Sửa tài sản (cùng đường dẫn với BE)
  http.put(
    '*/api/owner/assets/:assetId',
    ownerRoute(({ userId, params, body }) => {
      const parsed = parseAssetUpdate(body)
      if (parsed.error) return problem(400, parsed.error)
      const asset = ownedAssets(getDb(), userId).find((a) => a.assetId === Number(params.assetId))
      if (!asset) return problem(404, 'Asset not found.')
      if (vaultLocked(getDb(), asset.vaultId)) return problem(409, HANDOVER_LOCK)
      if (asset.status !== 'Active') return problem(409, 'Asset is not active.')
      Object.assign(asset, parsed.value)
      saveDb()
      return HttpResponse.json(assetDto(asset))
    }),
  ),

  // BE không xoá tài sản mà thu hồi: Status = Revoked, dữ liệu vẫn nằm trong danh sách
  http.post(
    '*/api/owner/assets/:assetId/revoke',
    ownerRoute(({ userId, params }) => {
      const asset = ownedAssets(getDb(), userId).find((a) => a.assetId === Number(params.assetId))
      if (!asset) return problem(404, 'Asset not found.')
      if (vaultLocked(getDb(), asset.vaultId)) return problem(409, HANDOVER_LOCK)
      if (asset.status !== 'Active') return problem(409, 'Asset is not active.')
      asset.status = 'Revoked'
      saveDb()
      return new HttpResponse(null, { status: 204 })
    }),
  ),

  http.get(
    '*/api/owner/assets/:assetId/allocations',
    ownerRoute(({ userId, params }) => {
      const db = getDb()
      const asset = ownedAssets(db, userId).find((a) => a.assetId === Number(params.assetId))
      if (!asset) return problem(404, 'Asset not found.')
      return HttpResponse.json(db.assignments.filter((a) => a.assetId === asset.assetId).map((a) => assignmentDto(db, a)))
    }),
  ),

  http.put(
    '*/api/owner/assets/:assetId/allocations/:assignmentId',
    ownerRoute(({ userId, params, body }) => {
      const parsed = parseAllocation(body)
      if (parsed.error) return problem(400, parsed.error)
      const db = getDb()
      const asset = ownedAssets(db, userId).find((a) => a.assetId === Number(params.assetId))
      if (!asset) return problem(404, 'Asset not found.')
      const assignment = db.assignments.find((a) => a.assetId === asset.assetId && a.assignmentId === Number(params.assignmentId))
      if (!assignment) return problem(404, 'Assignment not found.')
      if (vaultLocked(db, asset.vaultId)) return problem(409, HANDOVER_LOCK)
      if (asset.status !== 'Active' || assignment.status !== 'Active') return problem(409, 'Assignment is not active.')
      const others = db.assignments.filter((a) => a.assetId === asset.assetId && a.status === 'Active' && a !== assignment)
      const total = others.reduce((sum, a) => sum + a.allocation, 0)
      if (Math.round((total + parsed.value) * 100) / 100 > 100) return problem(409, 'Allocation total exceeds 100 percent.')
      assignment.allocation = parsed.value
      saveDb()
      return HttpResponse.json(assignmentDto(db, assignment))
    }),
  ),

  // Thu hồi phân bổ: hàng vẫn còn với Status = Revoked, phần trăm trả về chưa phân bổ
  http.post(
    '*/api/owner/assets/:assetId/allocations/:assignmentId/revoke',
    ownerRoute(({ userId, params }) => {
      const db = getDb()
      const asset = ownedAssets(db, userId).find((a) => a.assetId === Number(params.assetId))
      if (!asset) return problem(404, 'Asset not found.')
      const assignment = db.assignments.find((a) => a.assetId === asset.assetId && a.assignmentId === Number(params.assignmentId))
      if (!assignment) return problem(404, 'Assignment not found.')
      if (vaultLocked(db, asset.vaultId)) return problem(409, HANDOVER_LOCK)
      if (asset.status !== 'Active' || assignment.status !== 'Active') return problem(409, 'Assignment is not active.')
      assignment.status = 'Revoked'
      saveDb()
      return HttpResponse.json(assignmentDto(db, assignment))
    }),
  ),

  // Thu hồi giấy tờ: như BE (RevokeDocument) kho không được có hồ sơ bàn giao, tài sản phải còn hoạt động
  http.post(
    '*/api/owner/assets/:assetId/documents/:documentId/revoke',
    ownerRoute(({ userId, params }) => {
      const db = getDb()
      const asset = ownedAssets(db, userId).find((item) => item.assetId === Number(params.assetId))
      if (!asset) return problem(404, 'Asset not found.')
      if (vaultLocked(db, asset.vaultId)) return problem(409, HANDOVER_LOCK)
      if (asset.status !== 'Active') return problem(409, 'Asset is inactive.')
      const found = asset.documents.find((item) => item.documentId === Number(params.documentId))
      if (!found) return problem(404, 'Document not found.')
      if (found.revoked) return problem(409, 'Document already revoked.')
      found.revoked = true
      saveDb()
      return new HttpResponse(null, { status: 204 })
    }),
  ),

  // Nội dung giấy tờ: mock trả một tệp văn bản mô phỏng (không phải nội dung thật), kèm header chữ ký như BE
  http.get(
    '*/api/owner/assets/:assetId/documents/:documentId/content',
    ownerRoute(({ userId, params }) => {
      const asset = ownedAssets(getDb(), userId).find((a) => a.assetId === Number(params.assetId))
      const found = asset && activeDocuments(asset.documents).find((item) => item.documentId === Number(params.documentId))
      if (!found) return problem(404, 'Document not found.')
      const content = `Tệp mô phỏng cho giấy tờ "${found.fileName}".\nĐây là nội dung mô phỏng, không phải bản gốc đã mã hóa lưu trên máy chủ.\n`
      return new HttpResponse(content, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Signature-Valid': 'true' } })
    }),
  ),

  // Xác nhận còn sống của Owner (BE: ManagementService.LifeConfirmation/ConfirmAlive). Thời gian do máy chủ đặt, không nhận từ client
  http.get(
    '*/api/owner/life-confirmation',
    ownerRoute(({ userId }) => HttpResponse.json({ ownerId: userId, lastConfirmedAliveAt: getDb().proofOfLife[userId]?.lastPingAt ?? null })),
  ),

  http.post(
    '*/api/owner/life-confirmation',
    ownerRoute(({ userId }) => {
      const db = getDb()
      const vaultIds = ownedVaults(db, userId).map((vault) => vault.vaultId)
      const handovers = db.handovers.filter((item) => vaultIds.includes(item.vaultId))
      if (handovers.some((item) => ['Approved', 'In_Progress', 'Completed'].includes(item.status))) {
        return problem(409, 'A legally confirmed handover exists. Resolve the conflicting legal record before confirming alive.')
      }
      if (handovers.some((item) => !['Cancelled', 'Rejected', 'Declined'].includes(item.status) && item.documents.some((doc) => doc.purpose === 'DeathCertificate'))) {
        return problem(409, 'A death report or legally confirmed handover exists. Resolve the conflicting report before confirming alive.')
      }
      const now = new Date().toISOString()
      db.proofOfLife[userId] = { frequencyDays: 30, gracePeriodDays: 14, missedCount: 0, ...db.proofOfLife[userId], lastPingAt: now }
      saveDb()
      return HttpResponse.json({ ownerId: userId, lastConfirmedAliveAt: now })
    }),
  ),

  // ---- Hồ sơ bàn giao nhìn từ Owner ----
  http.get(
    '*/api/owner/handovers',
    ownerRoute(({ userId, request }) => {
      const db = getDb()
      const url = new URL(request.url)
      const page = Math.max(Number(url.searchParams.get('page')) || 1, 1)
      const pageSize = Math.min(Math.max(Number(url.searchParams.get('pageSize')) || 20, 1), 100)
      const status = url.searchParams.get('status')
      const vaultIds = ownedVaults(db, userId).map((vault) => vault.vaultId)
      const items = db.handovers
        .filter((item) => vaultIds.includes(item.vaultId) && (!status || item.status === status))
        .sort((a, b) => b.requestId - a.requestId)
        .slice((page - 1) * pageSize, page * pageSize)
        .map(ownerHandoverDto)
      return HttpResponse.json({ page, pageSize, items })
    }),
  ),

  http.get(
    '*/api/owner/handovers/:requestId',
    ownerRoute(({ userId, params }) => {
      const db = getDb()
      const vaultIds = ownedVaults(db, userId).map((vault) => vault.vaultId)
      const handover = db.handovers.find((item) => item.requestId === Number(params.requestId) && vaultIds.includes(item.vaultId))
      return handover ? HttpResponse.json(ownerHandoverDto(handover)) : problem(404, 'Request not found.')
    }),
  ),

  // Owner chỉ hủy được hồ sơ Draft hoặc Rejected
  http.post(
    '*/api/owner/handovers/:requestId/cancel',
    ownerRoute(({ userId, params }) => {
      const db = getDb()
      const vaultIds = ownedVaults(db, userId).map((vault) => vault.vaultId)
      const handover = db.handovers.find((item) => item.requestId === Number(params.requestId) && vaultIds.includes(item.vaultId))
      if (!handover) return problem(404, 'Handover request not found.')
      if (!['Pending_Executor', 'Draft', 'Rejected'].includes(handover.status)) return problem(409, 'Only awaiting Executor, draft or rejected requests can be cancelled.')
      handover.status = 'Cancelled'
      saveDb()
      return new HttpResponse(null, { status: 204 })
    }),
  ),

  // Owner tạo hồ sơ bàn giao (BE: ManagementService.CreateRequest); chưa có Executor thì BE tự gán một người độc lập
  http.post(
    '*/api/owner/vaults/:vaultId/handovers',
    ownerRoute(({ userId, params }) => {
      const db = getDb()
      const vaultId = Number(params.vaultId)
      const vault = ownedVaults(db, userId).find((item) => item.vaultId === vaultId)
      if (!vault) return problem(404, 'Vault not found.')
      if (vault.status !== 'Active' || vaultLocked(db, vaultId)) return problem(409, 'Vault is inactive or has a protected handover record.')
      if (vaultNotReady(db, vaultId)) return problem(409, 'Every active asset needs documents and exactly 100 percent active allocation.')

      let executorId = db.executorAssignments[vaultId]?.executorId
      if (!executorId) {
        const candidate = db.users.find((user) => user.roles.includes('Executor') && (user.status ?? 'Active') === 'Active')
        if (!candidate) return problem(503, 'No independent active Executor is available. Provision an eligible Executor before retrying.')
        executorId = candidate.userId
        db.executorAssignments[vaultId] = { executorId, status: 'AutoAssigned', assignedAt: new Date().toISOString(), contractNumber: null }
      }
      const assetIds = db.assets.filter((asset) => asset.vaultId === vaultId).map((asset) => asset.assetId)
      const isBeneficiary = db.assignments.some((item) => item.status === 'Active' && assetIds.includes(item.assetId) && item.beneficiaryId === executorId)
      if (executorId === userId || isBeneficiary) return problem(409, 'Assigned Executor must be independent of the owner and beneficiaries.')

      const request = { requestId: nextId('handover'), vaultId, executorId, status: 'Pending_Executor', initiatedAt: new Date().toISOString(), documents: [], cases: draftCases(db, vaultId) }
      db.handovers.push(request)
      saveDb()
      return HttpResponse.json(ownerHandoverDto(request), { status: 201, headers: { Location: `/api/owner/handovers/${request.requestId}` } })
    }),
  ),

  // ---- Cổng Executor (BE có thật, role Executor) ----
  http.get(
    '*/api/executor/assignments',
    executorRoute(({ userId }) => {
      const list = Object.entries(getDb().executorAssignments)
        .filter(([, assignment]) => assignment.executorId === userId && assignment.status !== 'Revoked')
        .map(([vaultId, assignment]) => ({ vaultId: Number(vaultId), executorId: assignment.executorId, status: assignment.status, assignedAt: assignment.assignedAt }))
      return HttpResponse.json(list)
    }),
  ),

  // Tạo hồ sơ Draft cho kho được phân công: mỗi phân bổ Active của tài sản Active trong kho là một case
  http.post(
    '*/api/executor/assignments/:vaultId/handovers',
    executorRoute(({ userId, params }) => {
      const db = getDb()
      const vaultId = Number(params.vaultId)
      const assignment = db.executorAssignments[vaultId]
      if (assignment?.executorId !== userId || assignment.status === 'Revoked') return problem(403, 'This vault is not assigned to you.')
      if (vaultLocked(db, vaultId)) {
        return problem(409, 'A handover request already exists for this vault.')
      }
      const cases = draftCases(db, vaultId)
      if (cases.length === 0) return problem(409, 'The vault has no allocated assets to hand over.')
      const request = { requestId: nextId('handover'), vaultId, executorId: userId, status: 'Draft', initiatedAt: new Date().toISOString(), documents: [], cases }
      db.handovers.push(request)
      saveDb()
      return HttpResponse.json(handoverDto(request), { status: 201, headers: { Location: `/api/executor/handovers/${request.requestId}` } })
    }),
  ),

  http.get(
    '*/api/executor/handovers',
    executorRoute(({ userId }) =>
      HttpResponse.json(
        getDb()
          .handovers.filter((item) => item.executorId === userId)
          .sort((a, b) => b.requestId - a.requestId)
          .map(handoverDto),
      ),
    ),
  ),

  http.get(
    '*/api/executor/handovers/:requestId',
    executorRoute(({ userId, params }) => {
      const request = ownHandover(userId, params.requestId)
      return request ? HttpResponse.json(handoverDto(request)) : problem(404, 'Handover request not found.')
    }),
  ),

  http.post('*/api/executor/handovers/:requestId/death-certificate', executorRoute((info) => uploadHandoverDocument(info, 'DeathCertificate'))),
  http.post('*/api/executor/handovers/:requestId/documents', executorRoute((info) => uploadHandoverDocument(info, 'Evidence'))),

  // Gửi thẩm định pháp lý: cần giấy chứng tử, người xác minh độc lập; hồ sơ chuyển sang Pending_Legal
  // Executor chấp nhận hồ sơ chờ tiếp nhận: kiểm tra lại kho còn đủ điều kiện rồi chuyển sang bản nháp (BE: AcceptRequest)
  http.post(
    '*/api/executor/handovers/:requestId/accept',
    executorRoute(({ userId, params }) => {
      const db = getDb()
      const handover = ownHandover(userId, params.requestId)
      if (!handover) return problem(404, 'Assigned request not found.')
      if (handover.status !== 'Pending_Executor') return problem(409, 'Only an awaiting Executor request can be accepted.')
      const vault = db.vaults.find((item) => item.vaultId === handover.vaultId)
      if (vault?.status !== 'Active') return problem(409, 'Vault is not active.')
      if (vaultNotReady(db, handover.vaultId)) return problem(409, 'Every active asset needs documents and exactly 100 percent active allocation.')
      handover.status = 'Draft'
      notify(db, vault.ownerId, 'Handover', 'Executor accepted handover', 'The assigned Executor accepted your handover request.')
      saveDb()
      return HttpResponse.json(handoverDto(handover))
    }),
  ),

  // Executor từ chối tiếp nhận: đóng các case, thu hồi phân công và báo cho Owner kèm lý do (BE: DeclineRequest)
  http.post(
    '*/api/executor/handovers/:requestId/decline',
    executorRoute(({ userId, params, body }) => {
      const db = getDb()
      if (hasUnknownFields(body, ['reason'])) return problem(400, 'Request contains fields outside the contract.')
      const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
      if (!reason || reason.length > 2000) return problem(400, 'Decline reason is required.')
      const handover = ownHandover(userId, params.requestId)
      if (!handover) return problem(404, 'Assigned request not found.')
      if (handover.status !== 'Pending_Executor') return problem(409, 'Only an awaiting Executor request can be declined.')
      handover.status = 'Declined'
      handover.declineReason = reason
      handover.declinedAt = new Date().toISOString()
      handover.cases.forEach((item) => (item.status = 'Cancelled'))
      const assignment = db.executorAssignments[handover.vaultId]
      if (assignment?.executorId === userId) assignment.status = 'Revoked'
      const vault = db.vaults.find((item) => item.vaultId === handover.vaultId)
      notify(db, vault.ownerId, 'Handover', 'Executor declined handover', `Handover #${handover.requestId}: ${reason}`)
      saveDb()
      return HttpResponse.json(handoverDto(handover))
    }),
  ),

  // Thông báo của chính người dùng, mới nhất trước (BE: NotificationsController)
  http.get(
    '*/api/notifications',
    route(({ userId, request }) => {
      const url = new URL(request.url)
      const page = Math.max(Number(url.searchParams.get('page')) || 1, 1)
      const pageSize = Math.min(Math.max(Number(url.searchParams.get('pageSize')) || 20, 1), 100)
      const items = (getDb().notifications ?? [])
        .filter((item) => item.userId === userId)
        .sort((a, b) => b.notificationId - a.notificationId)
        .slice((page - 1) * pageSize, page * pageSize)
        .map(({ notificationId, type, title, message, isRead, createdAt }) => ({ notificationId, type, title, message, isRead, createdAt }))
      return HttpResponse.json({ page, pageSize, items })
    }),
  ),

  http.post(
    '*/api/notifications/:notificationId/read',
    route(({ userId, params }) => {
      const found = (getDb().notifications ?? []).find((item) => item.notificationId === Number(params.notificationId) && item.userId === userId)
      if (!found) return problem(404, 'Notification not found.')
      found.isRead = true
      saveDb()
      return new HttpResponse(null, { status: 204 })
    }),
  ),

  // Người xác minh đủ điều kiện cho hồ sơ (BE: ManagementService.LegalVerifiers): loại Executor, chủ kho và người thụ hưởng
  http.get(
    '*/api/executor/handovers/:requestId/legal-verifiers',
    executorRoute(({ userId, params }) => {
      const handover = ownHandover(userId, params.requestId)
      if (!handover) return problem(404, 'Assigned request not found.')
      const db = getDb()
      const ownerId = db.vaults.find((item) => item.vaultId === handover.vaultId)?.ownerId
      const beneficiaryIds = handover.cases.map((item) => item.beneficiaryId)
      const list = db.users
        .filter((user) => user.roles.includes('LegalVerifier') && (user.status ?? 'Active') === 'Active')
        .filter((user) => user.userId !== userId && user.userId !== ownerId && !beneficiaryIds.includes(user.userId))
        .map((user) => ({ userId: user.userId, fullName: user.fullName }))
      return HttpResponse.json(list)
    }),
  ),

  http.post(
    '*/api/executor/handovers/:requestId/legal-verifications',
    executorRoute(async ({ userId, params, request }) => {
      const handover = ownHandover(userId, params.requestId)
      if (!handover) return problem(404, 'Handover request not found.')
      if (!EDITABLE_HANDOVER_STATUSES.includes(handover.status)) {
        return problem(409, 'Only draft, rejected or additional-info requests can be submitted.')
      }
      const form = await readForm(request)
      if (!form) return problem(400, 'Request must be multipart/form-data.')
      if (hasUnknownFormFields(form, ['VerifierId', 'Comment', 'Evidence', 'Signature'])) return problem(400, 'Unexpected form field.')
      if (!isValidDocument(fieldOf(form, 'Evidence'))) return problem(400, 'Evidence must be 1 byte to 10 MB and a PDF, PNG, JPEG or text file.')
      const evidenceSignature = fieldOf(form, 'Signature')
      if (evidenceSignature !== null && !isValidSignature(evidenceSignature)) return problem(400, 'Invalid detached signature size.')
      const comment = fieldOf(form, 'Comment')
      if (typeof comment === 'string' && comment.length > 2000) return problem(400, 'Comment exceeds 2000 characters.')
      const verifierId = Number(fieldOf(form, 'VerifierId'))
      const db = getDb()
      const verifier = db.users.find((item) => item.userId === verifierId)
      const vaultOwner = db.vaults.find((item) => item.vaultId === handover.vaultId)?.ownerId
      const beneficiaryIds = handover.cases.map((item) => item.beneficiaryId)
      if (!verifier || !verifier.roles.includes('LegalVerifier') || verifierId === userId || verifierId === vaultOwner || beneficiaryIds.includes(verifierId)) {
        return problem(400, 'An independent legal verifier is required.')
      }
      handover.status = 'Pending_Legal'
      handover.verifierId = verifierId
      saveDb()
      return HttpResponse.json({ verificationId: nextId('verification') })
    }),
  ),

  http.post(
    '*/api/executor/handovers/:requestId/start',
    executorRoute(({ userId, params }) => {
      const handover = ownHandover(userId, params.requestId)
      if (!handover) return problem(404, 'Handover request not found.')
      if (handover.status !== 'Approved') return problem(409, 'Approved legal verification required.')
      handover.status = 'In_Progress'
      handover.cases.forEach((item) => (item.status = 'In_Progress'))
      saveDb()
      return new HttpResponse(null, { status: 204 })
    }),
  ),

  http.post(
    '*/api/executor/handovers/:requestId/complete',
    executorRoute(async ({ userId, params, request }) => {
      const handover = ownHandover(userId, params.requestId)
      if (!handover) return problem(404, 'Handover request not found.')
      if (!['Approved', 'In_Progress'].includes(handover.status)) return problem(409, 'Request must be approved or in progress.')
      const form = await readForm(request)
      if (!form) return problem(400, 'Request must be multipart/form-data.')
      if (hasUnknownFormFields(form, ['File', 'Signature'])) return problem(400, 'Unexpected form field.')
      if (!isValidDocument(fieldOf(form, 'File'))) return problem(400, 'File must be 1 byte to 10 MB and a PDF, PNG, JPEG or text file.')
      if (!isValidSignature(fieldOf(form, 'Signature'))) return problem(400, 'Invalid detached signature size.')
      handover.status = 'Completed'
      handover.cases.forEach((item) => (item.status = 'Completed'))
      saveDb()
      return new HttpResponse(null, { status: 204 })
    }),
  ),

  http.get(
    '*/api/executor/handovers/:requestId/documents/:documentId/content',
    executorRoute(({ userId, params }) => {
      const handover = ownHandover(userId, params.requestId)
      const found = handover?.documents.find((item) => item.documentId === Number(params.documentId))
      if (!found) return problem(404, 'Document not found.')
      const content = `Tệp mô phỏng cho giấy tờ "${found.fileName}".\nĐây là nội dung mô phỏng, không phải bản gốc đã mã hóa lưu trên máy chủ.\n`
      return new HttpResponse(content, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Signature-Valid': found.hasSignature ? 'true' : 'false' },
      })
    }),
  ),
]

// Mock đầy đủ = API đã có ở BE + API chưa có; chế độ hỗn hợp chỉ mock phần BE chưa có
export const handlers = [...coreHandlers, ...adminHandlers, ...paymentHandlers, ...chatHandlers, ...extraHandlers, ...passwordHandlers, ...legalHandlers]
export const hybridHandlers = [...extraHandlers, ...legalHandlers]
