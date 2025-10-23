// src/routes/run.ts
import { Router } from 'express';
import { canPublishNow, explainWindows } from '../services/scheduler.js';
import { renderCaption, pickStyleByCampaign, CaptionStyle } from '../templates/captions.js';

// si usas OpenAI para refinar:
import { refineWithOpenAI } from '../services/captionRefiner.js'; // lo creamos abajo si no existe

const router = Router();
