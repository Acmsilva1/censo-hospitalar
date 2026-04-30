import express from 'express';
import { CensoController } from '../controllers/CensoController.js';

const router = express.Router();
const censoController = new CensoController();

router.get('/health', censoController.getHealth);
router.get('/hospitals', censoController.getHospitals);
router.post('/censo/refresh', censoController.manualRefresh);

export default router;
