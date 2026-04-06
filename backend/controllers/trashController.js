/* ============================================
   TRASH CONTROLLER
   ============================================ */

const trashService = require('../services/trashService');

// Get trash items
async function getTrash(req, res) {
    try {
        const userId = req.user.userId;
        const items = await trashService.getTrashItems(userId);

        res.json({
            success: true,
            count: items.length,
            items
        });

    } catch (error) {
        console.error('Get trash error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get trash items'
        });
    }
}

// Restore item
async function restoreItem(req, res) {
    try {
        const userId = req.user.userId;
        const { id, type } = req.params;

        let result;

        if (type === 'file') {
            result = await trashService.restoreFile(id, userId);
        } else if (type === 'folder') {
            result = await trashService.restoreFolder(id, userId);
        } else {
            return res.status(400).json({
                success: false,
                message: 'Invalid item type'
            });
        }

        res.json({
            success: true,
            message: 'Item restored successfully',
            item: result.file || result.folder
        });

    } catch (error) {
        console.error('Restore error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to restore item'
        });
    }
}

// Permanently delete item
async function permanentDelete(req, res) {
    try {
        const userId = req.user.userId;
        const { id, type } = req.params;

        let result;

        if (type === 'file') {
            result = await trashService.permanentlyDeleteFile(id, userId);
        } else if (type === 'folder') {
            result = await trashService.permanentlyDeleteFolder(id, userId);
        } else {
            return res.status(400).json({
                success: false,
                message: 'Invalid item type'
            });
        }

        res.json({
            success: true,
            message: 'Item permanently deleted',
            freed_space: result.freed_space
        });

    } catch (error) {
        console.error('Permanent delete error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to delete item'
        });
    }
}

// Empty trash
async function emptyTrash(req, res) {
    try {
        const userId = req.user.userId;
        const result = await trashService.emptyTrash(userId);

        res.json({
            success: true,
            message: 'Trash emptied successfully',
            deleted_count: result.deleted_count,
            freed_space: result.freed_space
        });

    } catch (error) {
        console.error('Empty trash error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to empty trash'
        });
    }
}

module.exports = {
    getTrash,
    restoreItem,
    permanentDelete,
    emptyTrash
};
