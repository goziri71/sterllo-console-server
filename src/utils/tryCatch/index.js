export const tryCatchFunction = (constroller) => async (req, res, next) => {
    try {
        await constroller(req, res, next);
    } catch (error) {
        next(error);
    }
}