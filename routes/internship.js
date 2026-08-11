const express = require("express");
const router = express.Router();
const pool = require("../db/db");
const auth = require("../middleware/auth");

// IMPORTANT: search mapping import
const searchMap = require("../utils/searchMapping");

/* ---------------- GET ALL INTERNSHIPS ---------------- */
router.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM internships");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ---------------- SEARCH INTERNSHIPS (SMART SEARCH) ---------------- */
router.get("/search", async (req, res) => {
  try {
    const query = req.query.q?.toLowerCase();
    const location = req.query.location?.toLowerCase();

    if (!query && !location) {
      return res.status(400).json({ message: "Search query is required" });
    }

    const keywords = searchMap[query] || [query || ""];

    const conditions = keywords
      .map((_, i) => `
        i.title ILIKE $${i + 1}
        OR i.description ILIKE $${i + 1}
        OR i.field_tags ILIKE $${i + 1}
      `)
      .join(" OR ");

    let values = keywords.map(k => `%${k}%`);

    let locationCondition = "";
    if (location) {
      values.push(`%${location}%`);
      locationCondition = `AND i.location ILIKE $${values.length}`;
    }

    const result = await pool.query(
      `
      SELECT 
        i.*,
        c.name AS company_name,
        c.website AS company_website
      FROM internships i
      LEFT JOIN companies c
      ON i.company_id = c.id
      WHERE (${conditions})
      ${locationCondition}
      `,
      values
    );

    const formatted = result.rows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      location: row.location,
      field_tags: row.field_tags,
      company: {
        name: row.company_name || "",
        website: row.company_website || ""
      }
    }));

    res.json(formatted);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ---------------- APPLY INTERNSHIP ---------------- */
router.post("/apply/:id", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const internshipId = req.params.id;

    const existing = await pool.query(
      `
      SELECT *
      FROM applied_internships
      WHERE user_id = $1
      AND internship_id = $2
      `,
      [userId, internshipId]
    );

    if (existing.rowCount > 0) {
      return res.status(409).json({
        message: "You have already applied for this internship.",
      });
    }

    await pool.query(
      `
      INSERT INTO applied_internships (user_id, internship_id)
      VALUES ($1, $2)
      `,
      [userId, internshipId]
    );

    res.json({
      message: "Applied successfully",
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server error",
    });
  }
});

/* ---------------- SAVE INTERNSHIP ---------------- */
router.post("/save/:id", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const internshipId = req.params.id;

    const existing = await pool.query(
      `
      SELECT *
      FROM saved_internships
      WHERE user_id = $1
      AND internship_id = $2
      `,
      [userId, internshipId]
    );

    if (existing.rowCount > 0) {
      return res.status(409).json({
        message: "You have already saved this internship.",
      });
    }

    await pool.query(
      `
      INSERT INTO saved_internships (user_id, internship_id)
      VALUES ($1, $2)
      `,
      [userId, internshipId]
    );

    res.json({
      message: "Internship saved",
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server error",
    });
  }
});

/* ---------------- SAVED INTERNSHIPS ---------------- */
router.get("/saved", auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `
      SELECT
        i.id,
        i.title,
        i.description,
        i.location,
        i.field_tags,
        c.id AS company_id,
        c.name AS company_name,
        c.website AS company_website
      FROM internships i
      JOIN saved_internships s
        ON i.id = s.internship_id
      LEFT JOIN companies c
        ON i.company_id = c.id
      WHERE s.user_id = $1
      `,
      [userId]
    );

    const formatted = result.rows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      location: row.location,
      field_tags: row.field_tags,
      company: {
        id: row.company_id,
        name: row.company_name || "",
        website: row.company_website || ""
      }
    }));

    res.json(formatted);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});



/* ---------------- REMOVE SAVED INTERNSHIP ---------------- */
router.delete("/save/:id", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const internshipId = req.params.id;

    const result = await pool.query(
      `
      DELETE FROM saved_internships
      WHERE user_id = $1
      AND internship_id = $2
      RETURNING *
      `,
      [userId, internshipId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Saved internship not found",
      });
    }

    res.json({
      message: "Internship removed from saved",
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server error",
    });
  }
});

/* ---------------- APPLIED INTERNSHIPS ---------------- */
router.get("/applied", auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `
      SELECT
        i.id,
        i.title,
        i.description,
        i.location,
        i.field_tags,
        c.id AS company_id,
        c.name AS company_name,
        c.website AS company_website
      FROM internships i
      JOIN applied_internships a
        ON i.id = a.internship_id
      LEFT JOIN companies c
        ON i.company_id = c.id
      WHERE a.user_id = $1
      `,
      [userId]
    );

    const formatted = result.rows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      location: row.location,
      field_tags: row.field_tags,
      company: {
        id: row.company_id,
        name: row.company_name || "",
        website: row.company_website || ""
      }
    }));

    res.json(formatted);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/applied/:id", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const internshipId = req.params.id;

    const result = await pool.query(
      `
      DELETE FROM applied_internships
      WHERE user_id = $1
      AND internship_id = $2
      RETURNING *
      `,
      [userId, internshipId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Applied internship not found",
      });
    }

    res.json({
      message: "Internship removed from applied",
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server error",
    });
  }
});
/* ---------------- WITH COMPANIES ---------------- */
router.get("/with-companies", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        i.id,
        i.title,
        i.description,
        i.field_tags,
        i.location,
        c.id AS company_id,
        c.name AS company_name,
        c.website AS company_website
      FROM internships i
      LEFT JOIN companies c
      ON i.company_id = c.id
    `);

    const formatted = result.rows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      field_tags: row.field_tags,
      location: row.location,
      company: {
        id: row.company_id,
        name: row.company_name || "",
        website: row.company_website || ""
      }
    }));

    res.json(formatted);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

///profile route to get user info and counts of saved and applied internships

router.get("/profile", auth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user information
    const userResult = await pool.query(
      `
      SELECT name, email
      FROM users
      WHERE id = $1
      `,
      [userId]
    );

    if (userResult.rowCount === 0) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Count saved internships
    const savedResult = await pool.query(
      `
      SELECT COUNT(*) AS count
      FROM saved_internships
      WHERE user_id = $1
      `,
      [userId]
    );

    // Count applied internships
    const appliedResult = await pool.query(
      `
      SELECT COUNT(*) AS count
      FROM applied_internships
      WHERE user_id = $1
      `,
      [userId]
    );

    res.json({
      name: userResult.rows[0].name,
      email: userResult.rows[0].email,
      savedCount: Number(savedResult.rows[0].count),
      appliedCount: Number(appliedResult.rows[0].count),
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server error",
    });
  }
});


/* ---------------- SINGLE INTERNSHIP ---------------- */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT
        i.id,
        i.title,
        i.description,
        i.location,
        i.field_tags,
        c.name AS company_name,
        c.website AS company_website,
        c.description AS company_description
      FROM internships i
      JOIN companies c
        ON i.company_id = c.id
      WHERE i.id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Internship not found" });
    }

    const row = result.rows[0];

    res.json({
      id: row.id,
      title: row.title,
      description: row.description,
      location: row.location,
      field_tags: row.field_tags,
      company: {
        name: row.company_name || "",
        website: row.company_website || "",
        description: row.company_description || ""
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;