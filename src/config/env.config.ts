import dotenv from "dotenv";

dotenv.config();

const config = {
    pagination: {
        pageLimit: parseInt(process.env.PAGE_LIMIT || "20", 20),
    },
};

export default config;