/**
 * Self-check for password-reset scoping and vendor contact validation.
 * No DB, no network, no test framework.
 *
 *   npx ts-node src/scripts/authVendorValidation.selfcheck.ts
 */
import assert from "assert";
import { readFileSync } from "fs";
import { join } from "path";
import {
    resetPasswordSchema as userResetPasswordSchema,
} from "../utils/zod_validations/user.zod";
import {
    resetPasswordSchema as vendorResetPasswordSchema,
    vendorSignupSchemav2,
} from "../utils/zod_validations/vendor.zod";

const ok = (name: string) => console.log(`  ok - ${name}`);

function checkResetSchemasRequireEmail() {
    const userParsed = userResetPasswordSchema.parse({
        email: "buyer@example.com",
        token: "123456",
        newPass: "Password123!",
        confirmPass: "Password123!",
    });
    assert.strictEqual(userParsed.email, "buyer@example.com");

    const vendorParsed = vendorResetPasswordSchema.parse({
        email: "vendor@example.com",
        token: "123456",
        newPass: "Password123!",
        confirmPass: "Password123!",
    });
    assert.strictEqual(vendorParsed.email, "vendor@example.com");

    assert.throws(() =>
        userResetPasswordSchema.parse({
            token: "123456",
            newPass: "Password123!",
            confirmPass: "Password123!",
        }),
    );
    assert.throws(() =>
        vendorResetPasswordSchema.parse({
            token: "123456",
            newPass: "Password123!",
            confirmPass: "Password123!",
        }),
    );
    ok("reset schemas require email and keep it in parsed output");
}

function checkVendorTelephoneFormats() {
    const base = {
        businessName: "Valid Vendor",
        email: "vendor@example.com",
        password: "Password123!",
        phoneNumber: "9812345678",
        district: "Baitadi",
        businessRegNumber: "12345",
        taxDocuments: ["https://example.com/pan.pdf"],
    };

    assert.strictEqual(
        vendorSignupSchemav2.parse({ ...base, telePhone: "011234567" })
            .telePhone,
        "011234567",
    );
    assert.strictEqual(
        vendorSignupSchemav2.parse({ ...base, telePhone: "01-1234567" })
            .telePhone,
        "01-1234567",
    );
    assert.strictEqual(
        vendorSignupSchemav2.parse({ ...base, telePhone: " 011234567 " })
            .telePhone,
        "011234567",
    );

    for (const telePhone of [
        "01123456",
        "0112345678",
        "01--123456",
        "01 1234567",
        "ab-1234567",
        "01_1234567",
    ]) {
        assert.throws(
            () => vendorSignupSchemav2.parse({ ...base, telePhone }),
            `telePhone ${telePhone} must be rejected`,
        );
    }
    ok("vendor telephone accepts only 011234567 or 01-1234567 style values");
}

function checkForgotPasswordSourceFlow() {
    const userController = readFileSync(
        join(__dirname, "..", "controllers", "user.controller.ts"),
        "utf8",
    );
    const vendorController = readFileSync(
        join(__dirname, "..", "controllers", "vendor.controller.ts"),
        "utf8",
    );
    const vendorForgotBlock =
        vendorController.match(/async forgotPassword[\s\S]*?async resetPassword/)?.[0] ??
        "";
    const vendorResetBlock =
        vendorController.match(/async resetPassword[\s\S]*?async getVendorById/)?.[0] ??
        "";

    assert.ok(
        userController.includes(
            "google registered users cannot change password, please login through google.",
        ),
        "user forgot password must use exact Google-account error copy",
    );
    assert.ok(
        /async resetPassword[\s\S]*user\.provider === AuthProvider\.GOOGLE[\s\S]*google registered users cannot change password, please login through google\./.test(
            userController,
        ),
        "user reset password must block Google/LWG accounts before OTP/password change",
    );
    assert.ok(
        vendorController.includes(
            "vendor does not exist for provided mail.",
        ),
        "vendor forgot/reset must use exact missing-vendor error copy",
    );
    assert.ok(
        !/findUserByEmail/.test(vendorForgotBlock) &&
            !/findUserByEmail/.test(vendorResetBlock),
        "vendor forgot password flow must never query users",
    );
    assert.ok(
        vendorForgotBlock.includes("parsed.data.email.trim().toLowerCase()") &&
            vendorResetBlock.includes("parsed.data.email.trim().toLowerCase()"),
        "vendor forgot/reset must normalize email before lookup",
    );
    assert.ok(
        /bcrypt\.compare\(token, vendor\.resetToken\)[\s\S]*if \(!isMatch\)/.test(
            vendorResetBlock,
        ),
        "vendor reset must verify OTP before changing password",
    );
    ok("forgot-password flows are scoped to correct account type and OTP order");
}

checkResetSchemasRequireEmail();
checkVendorTelephoneFormats();
checkForgotPasswordSourceFlow();
console.log("\nall checks passed");
