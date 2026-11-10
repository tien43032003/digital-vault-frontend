import {
  isValidEmail,
  normalizeIdentityNumber,
  validateAssignment,
  validateAsset,
  validateBeneficiary,
  validateHandoverDocument,
  validateDeclineReason,
  validateLegalRequest,
  validateLogin,
  validateNewPassword,
  validateOtp,
  validatePasswordChange,
  validateProfile,
  validateRegister,
  validateUpload,
  validateVault,
} from './validators'

describe('validators', () => {
  it('isValidEmail_ValidAddress_ReturnsTrue', () => {
    expect(isValidEmail('an.nguyen@aeternavault.io')).toBe(true)
  })

  it('isValidEmail_MissingDomain_ReturnsFalse', () => {
    expect(isValidEmail('an.nguyen@')).toBe(false)
  })

  it('validateLogin_EmptyFields_ReturnsBothErrors', () => {
    expect(validateLogin({ email: '', password: '' })).toEqual({
      email: 'Vui lòng nhập email.',
      password: 'Vui lòng nhập mật khẩu.',
    })
  })

  it('validateLogin_InvalidEmail_ReturnsEmailError', () => {
    expect(validateLogin({ email: 'abc', password: 'x' })).toEqual({ email: 'Email không hợp lệ.' })
  })

  it('validateLogin_PasswordTooLong_ReturnsPasswordError', () => {
    expect(validateLogin({ email: 'a@b.co', password: 'x'.repeat(1025) })).toEqual({
      password: 'Mật khẩu tối đa 1024 ký tự.',
    })
  })

  it('validateLogin_ValidInput_ReturnsEmptyObject', () => {
    expect(validateLogin({ email: 'a@b.co', password: 'secret' })).toEqual({})
  })
})

describe('validateRegister', () => {
  const valid = {
    fullName: 'Nguyễn Văn An',
    email: 'an.nguyen@example.com',
    phone: '0901 234 567',
    password: 'Secure#Pass2026',
    confirmPassword: 'Secure#Pass2026',
    acceptTerms: true,
  }

  it('validateRegister_ValidInput_ReturnsEmptyObject', () => {
    expect(validateRegister(valid)).toEqual({})
  })

  it('validateRegister_EmptyForm_ReturnsAllRequiredErrors', () => {
    const errors = validateRegister({ fullName: '', email: '', phone: '', password: '', confirmPassword: '', acceptTerms: false })
    expect(Object.keys(errors).sort()).toEqual(['acceptTerms', 'confirmPassword', 'email', 'fullName', 'password', 'phone'])
  })

  it('validateRegister_FullNameTooLong_ReturnsFullNameError', () => {
    expect(validateRegister({ ...valid, fullName: 'a'.repeat(101) })).toEqual({ fullName: 'Họ tên tối đa 100 ký tự.' })
  })

  it('validateRegister_EmailTooLong_ReturnsEmailError', () => {
    expect(validateRegister({ ...valid, email: `${'a'.repeat(140)}@example.com` })).toEqual({ email: 'Email tối đa 150 ký tự.' })
  })

  it('validateRegister_InvalidPhone_ReturnsPhoneError', () => {
    expect(validateRegister({ ...valid, phone: '09ab' })).toEqual({ phone: 'Số điện thoại không hợp lệ.' })
  })

  it('validateRegister_PasswordShorterThan12_ReturnsPasswordError', () => {
    expect(validateRegister({ ...valid, password: 'Abc#1234567', confirmPassword: 'Abc#1234567' })).toEqual({
      password: 'Mật khẩu tối thiểu 12 ký tự, có số và ký tự đặc biệt.',
    })
  })

  it('validateRegister_PasswordWithoutSpecialChar_ReturnsPasswordError', () => {
    expect(validateRegister({ ...valid, password: 'SecurePass2026', confirmPassword: 'SecurePass2026' })).toEqual({
      password: 'Mật khẩu tối thiểu 12 ký tự, có số và ký tự đặc biệt.',
    })
  })

  it('validateRegister_ConfirmMismatch_ReturnsConfirmError', () => {
    expect(validateRegister({ ...valid, confirmPassword: 'Other#Pass2026' })).toEqual({
      confirmPassword: 'Mật khẩu xác nhận không khớp.',
    })
  })

  it('validateRegister_TermsNotAccepted_ReturnsTermsError', () => {
    expect(validateRegister({ ...valid, acceptTerms: false })).toEqual({
      acceptTerms: 'Bạn cần đồng ý với Điều khoản dịch vụ.',
    })
  })
})

describe('identity number (CCCD) on register', () => {
  const base = {
    fullName: 'Nguyễn Văn An',
    email: 'an@example.com',
    phone: '0901234567',
    password: 'Secure#Pass2026',
    confirmPassword: 'Secure#Pass2026',
    acceptTerms: true,
  }

  it('normalizeIdentityNumber_WithSpaces_RemovesAllWhitespace', () => {
    expect(normalizeIdentityNumber(' 079 094 004521 ')).toBe('079094004521')
  })

  it('normalizeIdentityNumber_UndefinedOrEmpty_ReturnsEmptyString', () => {
    expect(normalizeIdentityNumber(undefined)).toBe('')
    expect(normalizeIdentityNumber('   ')).toBe('')
  })

  it('validateRegister_NoIdentityNumber_IsOptionalAndValid', () => {
    expect(validateRegister(base)).toEqual({})
    expect(validateRegister({ ...base, identityNumber: '' })).toEqual({})
  })

  it('validateRegister_TwelveDigitIdentityNumber_IsValid', () => {
    expect(validateRegister({ ...base, identityNumber: '079094004521' })).toEqual({})
  })

  it('validateRegister_IdentityNumberWithSpaces_IsValid', () => {
    expect(validateRegister({ ...base, identityNumber: '079 094 004521' })).toEqual({})
  })

  it('validateRegister_WrongLengthIdentityNumber_ReturnsError', () => {
    expect(validateRegister({ ...base, identityNumber: '12345' })).toEqual({
      identityNumber: 'Số CCCD gồm đúng 12 chữ số.',
    })
  })

  it('validateRegister_NonDigitIdentityNumber_ReturnsError', () => {
    expect(validateRegister({ ...base, identityNumber: 'abcdefghijkl' })).toEqual({
      identityNumber: 'Số CCCD gồm đúng 12 chữ số.',
    })
  })
})

describe('validateVault', () => {
  it('validateVault_EmptyName_ReturnsNameError', () => {
    expect(validateVault({ name: '  ', description: '' })).toEqual({ name: 'Vui lòng nhập tên kho.' })
  })

  it('validateVault_NameTooLong_ReturnsNameError', () => {
    expect(validateVault({ name: 'x'.repeat(101), description: '' })).toEqual({ name: 'Tên kho tối đa 100 ký tự.' })
  })

  it('validateVault_DescriptionTooLong_ReturnsDescriptionError', () => {
    expect(validateVault({ name: 'Kho', description: 'x'.repeat(4001) })).toEqual({
      description: 'Mô tả tối đa 4000 ký tự.',
    })
  })

  it('validateVault_ValidInput_ReturnsEmptyObject', () => {
    expect(validateVault({ name: 'Kho', description: '' })).toEqual({})
  })
})

describe('validateBeneficiary', () => {
  const valid = { email: 'long@example.com', allocation: '40' }

  it('validateBeneficiary_EmptyFields_ReturnsBothErrors', () => {
    expect(validateBeneficiary({ email: '', allocation: '' }, 100)).toEqual({
      email: 'Vui lòng nhập email.',
      allocation: 'Vui lòng nhập tỷ lệ phân bổ.',
    })
  })

  it('validateBeneficiary_InvalidEmail_ReturnsEmailError', () => {
    expect(validateBeneficiary({ ...valid, email: 'abc' }, 100)).toEqual({ email: 'Email không hợp lệ.' })
  })

  it('validateBeneficiary_AllocationOutOfRange_ReturnsRangeError', () => {
    const message = 'Tỷ lệ phải từ 0,01 đến 100.'
    expect(validateBeneficiary({ ...valid, allocation: '0' }, 100)).toEqual({ allocation: message })
    expect(validateBeneficiary({ ...valid, allocation: '101' }, 100)).toEqual({ allocation: message })
    expect(validateBeneficiary({ ...valid, allocation: 'abc' }, 100)).toEqual({ allocation: message })
  })

  it('validateBeneficiary_ThreeDecimals_ReturnsDecimalError', () => {
    expect(validateBeneficiary({ ...valid, allocation: '10.123' }, 100)).toEqual({
      allocation: 'Tỷ lệ tối đa 2 chữ số thập phân.',
    })
  })

  it('validateBeneficiary_ExceedsRemaining_ReturnsRemainingError', () => {
    expect(validateBeneficiary({ ...valid, allocation: '70' }, 60)).toEqual({
      allocation: 'Chỉ còn 60% có thể phân bổ.',
    })
  })

  it('validateBeneficiary_ValidInput_ReturnsEmptyObject', () => {
    expect(validateBeneficiary(valid, 100)).toEqual({})
  })
})

describe('validateAssignment', () => {
  const valid = { assetId: '4', email: 'long@example.com', allocation: '40' }

  it('validateAssignment_NoAssetSelected_ReturnsAssetError', () => {
    expect(validateAssignment({ ...valid, assetId: '' }, 100)).toEqual({ assetId: 'Vui lòng chọn tài sản.' })
  })

  it('validateAssignment_EmptyEverything_ReturnsAllThreeErrors', () => {
    expect(validateAssignment({ assetId: '', email: '', allocation: '' }, 100)).toEqual({
      assetId: 'Vui lòng chọn tài sản.',
      email: 'Vui lòng nhập email.',
      allocation: 'Vui lòng nhập tỷ lệ phân bổ.',
    })
  })

  it('validateAssignment_AllocationOverRemaining_ReturnsRemainingError', () => {
    expect(validateAssignment({ ...valid, allocation: '70' }, 30)).toEqual({ allocation: 'Chỉ còn 30% có thể phân bổ.' })
  })

  it('validateAssignment_ValidInput_ReturnsEmptyObject', () => {
    expect(validateAssignment(valid, 100)).toEqual({})
  })
})

describe('validateUpload', () => {
  const file = { name: 'HopDong.pdf', type: 'application/pdf', size: 2048 }
  const signature = { name: 'HopDong.sig', type: '', size: 256 }

  it('validateUpload_FileAndSignature_ReturnsEmptyObject', () => {
    expect(validateUpload({ file, signature, beneficiaryId: '' })).toEqual({})
  })

  it('validateUpload_WithBeneficiary_ReturnsEmptyObject', () => {
    expect(validateUpload({ file, signature, beneficiaryId: '11' })).toEqual({})
  })

  it('validateUpload_NothingSelected_RequiresFileAndSignatureButNotBeneficiary', () => {
    expect(validateUpload({ file: null, signature: null, beneficiaryId: '' })).toEqual({
      file: 'Vui lòng chọn file giấy tờ.',
      signature: 'Vui lòng chọn file chữ ký rời.',
    })
  })

  it('validateUpload_FileOverTenMegabytes_ReturnsSizeError', () => {
    expect(validateUpload({ file: { ...file, size: 10 * 1024 * 1024 + 1 }, signature })).toEqual({ file: 'File phải từ 1 byte đến 10 MB.' })
  })

  it('validateUpload_UnsupportedFileType_ReturnsTypeError', () => {
    expect(validateUpload({ file: { name: 'virus.exe', type: 'application/x-msdownload', size: 10 }, signature })).toEqual({
      file: 'Chỉ hỗ trợ PDF, PNG, JPEG hoặc văn bản (.txt).',
    })
  })

  it('validateUpload_SignatureOverSixteenKilobytes_ReturnsSizeError', () => {
    expect(validateUpload({ file, signature: { ...signature, size: 16385 } })).toEqual({ signature: 'File chữ ký phải từ 1 byte đến 16 KB.' })
  })

  it('validateUpload_EmptySignature_ReturnsSizeError', () => {
    expect(validateUpload({ file, signature: { ...signature, size: 0 } })).toEqual({ signature: 'File chữ ký phải từ 1 byte đến 16 KB.' })
  })
})

describe('validateAsset', () => {
  const valid = { name: 'Tài khoản', type: 'BankAccount', description: '' }

  it('validateAsset_EmptyName_ReturnsNameError', () => {
    expect(validateAsset({ ...valid, name: '' })).toEqual({ name: 'Vui lòng nhập tên tài sản.' })
  })

  it('validateAsset_NameTooLong_ReturnsNameError', () => {
    expect(validateAsset({ ...valid, name: 'x'.repeat(101) })).toEqual({ name: 'Tên tài sản tối đa 100 ký tự.' })
  })

  it('validateAsset_EmptyType_ReturnsTypeError', () => {
    expect(validateAsset({ ...valid, type: '' })).toEqual({ type: 'Vui lòng chọn loại tài sản.' })
  })

  it('validateAsset_NonAsciiType_ReturnsTypeError', () => {
    expect(validateAsset({ ...valid, type: 'Ngân hàng' })).toEqual({
      type: 'Loại tài sản chỉ gồm ký tự ASCII, tối đa 50 ký tự.',
    })
  })

  it('validateAsset_DescriptionTooLong_ReturnsDescriptionError', () => {
    expect(validateAsset({ ...valid, description: 'x'.repeat(4001) })).toEqual({
      description: 'Mô tả tối đa 4000 ký tự.',
    })
  })

  it('validateAsset_ValidInput_ReturnsEmptyObject', () => {
    expect(validateAsset(valid)).toEqual({})
  })
})

describe('validateProfile', () => {
  it('validateProfile_BlankName_ReturnsNameError', () => {
    expect(validateProfile({ fullName: '  ', phone: '' })).toEqual({ fullName: 'Vui lòng nhập họ tên.' })
  })

  it('validateProfile_NameTooLong_ReturnsNameError', () => {
    expect(validateProfile({ fullName: 'x'.repeat(101), phone: '' })).toEqual({ fullName: 'Họ tên tối đa 100 ký tự.' })
  })

  it('validateProfile_EmptyPhone_IsAllowed', () => {
    expect(validateProfile({ fullName: 'An', phone: '' })).toEqual({})
  })

  it('validateProfile_InvalidPhone_ReturnsPhoneError', () => {
    expect(validateProfile({ fullName: 'An', phone: 'abc' })).toEqual({ phone: 'Số điện thoại không hợp lệ.' })
  })

  it('validateProfile_ValidInput_ReturnsEmptyObject', () => {
    expect(validateProfile({ fullName: 'An', phone: '0901 234 567' })).toEqual({})
  })
})

describe('validatePasswordChange', () => {
  const valid = { currentPassword: 'MatKhauCu#2025', newPassword: 'MatKhauMoi#2026', confirmPassword: 'MatKhauMoi#2026' }

  it('validatePasswordChange_EmptyFields_ReturnsAllErrors', () => {
    expect(validatePasswordChange({ currentPassword: '', newPassword: '', confirmPassword: '' })).toEqual({
      currentPassword: 'Vui lòng nhập mật khẩu hiện tại.',
      newPassword: 'Vui lòng nhập mật khẩu mới.',
      confirmPassword: 'Vui lòng nhập lại mật khẩu mới.',
    })
  })

  it('validatePasswordChange_WeakNewPassword_ReturnsRuleError', () => {
    expect(validatePasswordChange({ ...valid, newPassword: 'ngan', confirmPassword: 'ngan' })).toEqual({
      newPassword: 'Mật khẩu tối thiểu 12 ký tự, có số và ký tự đặc biệt.',
    })
  })

  it('validatePasswordChange_SameAsCurrent_ReturnsError', () => {
    expect(validatePasswordChange({ ...valid, newPassword: valid.currentPassword, confirmPassword: valid.currentPassword })).toEqual({
      newPassword: 'Mật khẩu mới phải khác mật khẩu hiện tại.',
    })
  })

  it('validatePasswordChange_ConfirmMismatch_ReturnsError', () => {
    expect(validatePasswordChange({ ...valid, confirmPassword: 'Khac#Hoan2026x' })).toEqual({
      confirmPassword: 'Mật khẩu xác nhận không khớp.',
    })
  })

  it('validatePasswordChange_ValidInput_ReturnsEmptyObject', () => {
    expect(validatePasswordChange(valid)).toEqual({})
  })
})

describe('validateNewPassword', () => {
  it('validateNewPassword_EmptyFields_ReturnsBothErrors', () => {
    expect(validateNewPassword({ newPassword: '', confirmPassword: '' })).toEqual({
      newPassword: 'Vui lòng nhập mật khẩu mới.',
      confirmPassword: 'Vui lòng nhập lại mật khẩu mới.',
    })
  })

  it('validateNewPassword_Weak_ReturnsRuleError', () => {
    expect(validateNewPassword({ newPassword: 'ngan', confirmPassword: 'ngan' })).toEqual({
      newPassword: 'Mật khẩu tối thiểu 12 ký tự, có số và ký tự đặc biệt.',
    })
  })

  it('validateNewPassword_Mismatch_ReturnsConfirmError', () => {
    expect(validateNewPassword({ newPassword: 'MatKhauMoi#2026', confirmPassword: 'Khac#Hoan2026x' })).toEqual({
      confirmPassword: 'Mật khẩu xác nhận không khớp.',
    })
  })

  it('validateNewPassword_Valid_ReturnsEmptyObject', () => {
    expect(validateNewPassword({ newPassword: 'MatKhauMoi#2026', confirmPassword: 'MatKhauMoi#2026' })).toEqual({})
  })
})

describe('validateOtp', () => {
  it('validateOtp_SixDigits_ReturnsEmptyObject', () => {
    expect(validateOtp(' 123456 ')).toEqual({})
  })

  it('validateOtp_EmptyOrWrongFormat_ReturnsError', () => {
    expect(validateOtp('')).toEqual({ otp: 'Vui lòng nhập mã xác nhận.' })
    expect(validateOtp('12ab')).toEqual({ otp: 'Mã gồm đúng 6 chữ số.' })
    expect(validateOtp('1234567')).toEqual({ otp: 'Mã gồm đúng 6 chữ số.' })
  })
})

describe('validateHandoverDocument', () => {
  const file = { name: 'ChungTu.pdf', type: 'application/pdf', size: 2048 }
  const signature = { name: 'ChungTu.sig', type: '', size: 256 }

  it('validateHandoverDocument_FileOnlyAndSignatureOptional_ReturnsEmptyObject', () => {
    expect(validateHandoverDocument({ file, signature: null })).toEqual({})
  })

  it('validateHandoverDocument_NoFile_ReturnsRequiredError', () => {
    expect(validateHandoverDocument({ file: null, signature: null })).toEqual({ file: 'Vui lòng chọn file giấy tờ.' })
  })

  it('validateHandoverDocument_OptionalSignatureTooBig_ReturnsSizeError', () => {
    expect(validateHandoverDocument({ file, signature: { ...signature, size: 16385 } })).toEqual({ signature: 'File chữ ký phải từ 1 byte đến 16 KB.' })
  })

  it('validateHandoverDocument_SignatureRequiredButMissing_ReturnsRequiredError', () => {
    expect(validateHandoverDocument({ file, signature: null }, { signatureRequired: true })).toEqual({ signature: 'Vui lòng chọn file chữ ký rời.' })
  })

  it('validateHandoverDocument_SignatureRequiredAndPresent_ReturnsEmptyObject', () => {
    expect(validateHandoverDocument({ file, signature }, { signatureRequired: true })).toEqual({})
  })
})

describe('validateLegalRequest', () => {
  const evidence = { name: 'BangChung.pdf', type: 'application/pdf', size: 1024 }
  const signature = { name: 'BangChung.sig', size: 256 }

  it('validateLegalRequest_Valid_ReturnsEmptyObject', () => {
    expect(validateLegalRequest({ verifierId: '6', comment: 'ok', evidence, signature })).toEqual({})
  })

  it('validateLegalRequest_Empty_ReturnsRequiredErrors', () => {
    expect(validateLegalRequest({ verifierId: '', comment: '', evidence: null, signature: null })).toEqual({
      verifierId: 'Vui lòng chọn người xác minh pháp lý.',
      evidence: 'Vui lòng chọn file giấy tờ.',
      signature: 'Vui lòng chọn file chữ ký rời.',
    })
  })

  it.each([['0'], ['-3'], ['1.5'], ['abc']])('validateLegalRequest_InvalidVerifierId_ReturnsError', (verifierId) => {
    expect(validateLegalRequest({ verifierId, comment: '', evidence, signature })).toEqual({ verifierId: 'ID người xác minh phải là số nguyên dương.' })
  })

  it('validateLegalRequest_CommentOver2000_ReturnsError', () => {
    expect(validateLegalRequest({ verifierId: '6', comment: 'x'.repeat(2001), evidence, signature })).toEqual({ comment: 'Ghi chú tối đa 2000 ký tự.' })
  })

  it('validateLegalRequest_MissingSignature_ReturnsRequiredError', () => {
    expect(validateLegalRequest({ verifierId: '6', comment: '', evidence, signature: null })).toEqual({ signature: 'Vui lòng chọn file chữ ký rời.' })
  })

  it.each([[0], [16385]])('validateLegalRequest_SignatureSize%s_ReturnsSizeError', (size) => {
    expect(validateLegalRequest({ verifierId: '6', comment: '', evidence, signature: { name: 'x.sig', size } })).toEqual({ signature: 'File chữ ký phải từ 1 byte đến 16 KB.' })
  })
})

describe('validateDeclineReason', () => {
  it('validateDeclineReason_Valid_ReturnsNull', () => {
    expect(validateDeclineReason('Tôi bận')).toBeNull()
  })

  it.each([[''], ['   '], [undefined], [null]])('validateDeclineReason_Blank_ReturnsRequiredError', (value) => {
    expect(validateDeclineReason(value)).toBe('Vui lòng nhập lý do từ chối.')
  })

  it('validateDeclineReason_Over2000_ReturnsError', () => {
    expect(validateDeclineReason('x'.repeat(2001))).toBe('Lý do tối đa 2000 ký tự.')
    expect(validateDeclineReason('x'.repeat(2000))).toBeNull()
  })
})
