import {
    SignupInput,
    LoginInput,
    VerificationTokenInput,
    VerifyTokenInput,
    ResetPasswordInput,
    ChangeEmailInput,
    VerifyEmailChangeInput,
    UpdateUserInput,
} from '../utils/zod_validations/user.zod';

export interface ISignupRequest extends SignupInput { }

export interface ILoginRequest extends LoginInput { }

export interface IVerificationTokenRequest extends VerificationTokenInput { }

export interface IVerifyTokenRequest extends VerifyTokenInput { }

export interface IResetPasswordRequest extends ResetPasswordInput { }

export interface IChangeEmailRequest extends ChangeEmailInput { }

export interface IVerifyEmailChangeRequest extends VerifyEmailChangeInput { }

export interface IUpdateUserRequest extends UpdateUserInput { }

export interface IUserIdParams {
    id: number;
}