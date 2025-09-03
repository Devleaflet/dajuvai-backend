import dotenv from "dotenv";

dotenv.config();

const config = {
    pagination: {
        pageLimit: parseInt(process.env.PAGE_LIMIT || "10", 10), 
    },
};

export default config;
