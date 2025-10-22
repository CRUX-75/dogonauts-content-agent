// src/routes/run.ts
import { Router } from 'express';
import { canPublishNow, explainWindows } from '../services/scheduler';
import { renderCaption, pickStyleByCampaign, CaptionStyle } from '../templates/captions';

// si usas OpenAI para refinar:
import { refineWithOpenAI } from '../services/captionRefiner'; // lo creamos abajo si no existe

const router = Router();
