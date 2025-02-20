

const JWTNotFilter = () => {
    return (req, res, next) => {
        console.log("check not filter");
        next()
    }
}

export default JWTNotFilter;