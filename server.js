const express = require("express");
const cors = require("cors");
const pool = require("./db/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const auth = require("./middleware/auth");
const internshipRoutes = require("./routes/internship");

const app = express();

app.use(cors());
app.use(express.json());
app.use("/internships", internshipRoutes);

app.get("/", (req, res) => {
  res.send("InternLink Backend Running 🚀");
});

app.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // check if user exists
    const userExists = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (userExists.rows.length > 0) {
      return res.status(400).json({ message: "User already exists" });
    }

    // hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // insert user
   const newUser = await pool.query(
  "INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email, created_at",
  [name, email, hashedPassword]
);

    res.status(201).json({
      message: "User created successfully",
      user: newUser.rows[0],
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/login", async(req,res) => {
  try{
    const {email,password} = req.body;
    //finding user
    const userResult = await pool.query(
      "SELECT * FROM users WHERE email =$1",
      [email]
    );

    if(userResult.rows.length ===0){
      return res.status (401).json({
        message:"invalid email or password"
      });
    }

    const user = userResult.rows[0];

    // validate password
    const isMatch = await bcrypt.compare(
      password,
      user.password
    );

    if(!isMatch){
      return res.status(401).json({
        message:"Invalid email or password"
      });
    }

    // generate JWT
    const token = jwt.sign(
    {
     id: user.id,
     email: user.email,
    },
     process.env.JWT_SECRET,
    {
     expiresIn: "7d",
    }
    );


    res.status(200).json({
      message:"Login successful",
      token,
      user:{
        id:user.id,
        name:user.name,
        email:user.email,
      }
    });

  }catch (err){
    console.error(err);
    res.status(500).json({
      message:"Server error"
    })
  }
});


const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});