// src/common/search/searchRouter.js
import express from 'express';
import { searchService } from './searchService.js';

export function createSearchRouter({ path, Model, textFields, btreeFields }) {
    const router = express.Router();

    // GET /api/<path>?page=&size=&keyword=&searchType=&...btreeFields
    router.get(`/${path}`, async (req,res,next) => {
        try {
            const pageReq = {
                page:      parseInt(req.query.page) || 1,
                size:      parseInt(req.query.size) || 10,
                keyword:   req.query.keyword || '',
                searchType:req.query.searchType || 'both',
                // btreeFields 값추가
                ...btreeFields.reduce((acc, f) => {
                    if (req.query[f] != null) acc[f] = req.query[f];
                    return acc;
                }, {})
            };
            const pageRes = await searchService(Model, pageReq, { textFields, btreeFields });
            res.json(pageRes);
        } catch (err) {
            next(err);
        }
    });

    return router;
}
