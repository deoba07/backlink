const jwt = require("jsonwebtoken");

const auth = (req, res, next) => {
  try {
    const authHeader = req.header("Authorization");

    if (!authHeader) {
      return res.status(401).json({
        message: "Access denied",
      });
    }

    const token = authHeader.split(" ")[1];

    if(!token) {
        return res.status(401).json({
            message:"invalid token format",
        });
    }

    const verified = jwt.verify(
        token,
        process.env.JWT_SECRET
    );

    req.user = verified;

    next();
    
  } catch (error) {
    res.status(401).json({
      message: "Invalid token",
    });
  }
};

module.exports = auth;