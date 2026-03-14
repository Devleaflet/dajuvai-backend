import AppDataSource from "../config/db.config";
import { AuthProvider, User } from "../entities/user.entity";

const getGoogleUsers = async () => {
    await AppDataSource.initialize();
    const userRepo = AppDataSource.getRepository(User);

    const googleUsers = await userRepo.find({
        where: { provider: AuthProvider.GOOGLE },
        select: ["id", "fullName", "username", "email", "phoneNumber", "googleId", "isVerified", "role", "createdAt"],
    });

    console.log(`Found ${googleUsers.length} Google users:`);
    console.log(googleUsers);

    await AppDataSource.destroy();
};

getGoogleUsers().catch((err) => console.error(err));
