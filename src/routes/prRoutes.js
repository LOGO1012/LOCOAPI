// src/routes/prRoutes.js
import express from "express";
import { getPRTopUsers, getPRUserList } from "../controllers/prController.js";

const router = express.Router();

router.get("/top", getPRTopUsers);
router.get("/list", getPRUserList);

export default router;
