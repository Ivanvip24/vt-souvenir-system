/**
 * Facebook Marketplace Routes
 * Queue, export, and track design uploads to Facebook Marketplace.
 *
 * Extracted from server.js — Playbook S4
 */

import { Router } from 'express';
import * as facebookMarketplace from '../services/facebook-marketplace.js';
import * as facebookScheduler from '../services/facebook-scheduler.js';

const router = Router();

// Get Facebook upload statistics (auth required)
router.get('/stats', async (req, res) => {
  try {
    const stats = await facebookMarketplace.getUploadStats();
    const schedulerStatus = facebookScheduler.getSchedulerStatus();

    res.json({
      success: true,
      stats,
      scheduler: schedulerStatus
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error.message || 'Error desconocido') });
  }
});

// Get pending uploads (auth required)
router.get('/pending', async (req, res) => {
  try {
    const pending = await facebookMarketplace.getPendingUploads();
    res.json({ success: true, count: pending.length, data: pending });
  } catch (error) {
    res.status(500).json({ success: false, error: (error.message || 'Error desconocido') });
  }
});

// Queue a design for Facebook upload (auth required)
router.post('/queue', async (req, res) => {
  try {
    const { orderId, orderItemId, imageUrl, title } = req.body;

    if (!imageUrl || !title) {
      return res.status(400).json({
        success: false,
        error: 'imageUrl and title are required'
      });
    }

    const result = await facebookMarketplace.queueDesignForUpload(
      orderId, orderItemId, imageUrl, title
    );

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: (error.message || 'Error desconocido') });
  }
});

// Check if an image is uploaded to Facebook (auth required)
router.get('/status', async (req, res) => {
  try {
    const { imageUrl } = req.query;

    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        error: 'imageUrl query parameter is required'
      });
    }

    const status = await facebookMarketplace.isImageUploaded(imageUrl);
    res.json({ success: true, ...status });
  } catch (error) {
    res.status(500).json({ success: false, error: (error.message || 'Error desconocido') });
  }
});

// Get Facebook status for an order (auth required)
router.get('/order/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const status = await facebookMarketplace.getOrderFacebookStatus(orderId);
    res.json({ success: true, data: status });
  } catch (error) {
    res.status(500).json({ success: false, error: (error.message || 'Error desconocido') });
  }
});

// Get pending uploads data for local bot to process (auth required)
router.get('/export', async (req, res) => {
  try {
    const pending = await facebookMarketplace.getPendingUploads();

    if (pending.length === 0) {
      return res.json({ success: true, count: 0, listings: [], message: 'No pending uploads' });
    }

    // Return data for local processing
    res.json({
      success: true,
      count: pending.length,
      listings: pending.map(l => ({
        id: l.id,
        title: l.listing_title,
        imageUrl: l.image_url,
        price: l.listing_price || '11'
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error.message || 'Error desconocido') });
  }
});

// Mark listings as uploaded (called by local bot after success) (auth required)
router.post('/mark-uploaded', async (req, res) => {
  try {
    const { listingIds } = req.body;

    if (!listingIds || !Array.isArray(listingIds)) {
      return res.status(400).json({ success: false, error: 'listingIds array required' });
    }

    await facebookMarketplace.markAsUploaded(listingIds);
    res.json({ success: true, marked: listingIds.length });
  } catch (error) {
    res.status(500).json({ success: false, error: (error.message || 'Error desconocido') });
  }
});

export default router;
