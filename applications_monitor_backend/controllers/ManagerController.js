import { ManagerModel } from '../ManagerModel.js';
import { uploadToCloudinary, deleteFromCloudinary } from '../utils/cloudinary.js';

// Get all managers
export const getAllManagers = async (req, res) => {
  try {
    const managers = await ManagerModel.find({ isActive: true }).sort({ createdAt: -1 }).lean();
    res.status(200).json({ managers });
  } catch (error) {
    console.error('Error fetching managers:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get manager by ID
export const getManagerById = async (req, res) => {
  try {
    const { id } = req.params;
    const manager = await ManagerModel.findById(id).lean();
    
    if (!manager) {
      return res.status(404).json({ error: 'Manager not found' });
    }
    
    res.status(200).json({ manager });
  } catch (error) {
    console.error('Error fetching manager:', error);
    res.status(500).json({ error: error.message });
  }
};

// Create a new manager
export const createManager = async (req, res) => {
  try {
    const { fullName, email, phone, department, position, bio } = req.body;
    
    // Check if manager with email already exists
    const existingManager = await ManagerModel.findOne({ email: email.toLowerCase() });
    if (existingManager) {
      return res.status(400).json({ error: 'Manager with this email already exists' });
    }

    // Handle profile photo upload if present
    let profilePhotoUrl = null;
    if (req.file) {
      try {
        const uploadResult = await uploadToCloudinary(req.file.buffer);
        profilePhotoUrl = uploadResult.secure_url;
      } catch (uploadError) {
        console.error('Error uploading image:', uploadError);
        return res.status(500).json({ error: 'Failed to upload profile photo' });
      }
    }

    const managerData = {
      fullName,
      email: email.toLowerCase(),
      phone,
      department,
      position,
      bio,
      profilePhoto: profilePhotoUrl,
      isActive: true
    };

    const manager = new ManagerModel(managerData);
    await manager.save();

    res.status(201).json({
      message: 'Manager created successfully',
      manager
    });
  } catch (error) {
    console.error('Error creating manager:', error);
    res.status(500).json({ error: error.message });
  }
};

// Update manager
export const updateManager = async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, email, phone, department, position, bio } = req.body;
    
    // Check if manager exists
    const existingManager = await ManagerModel.findById(id);
    if (!existingManager) {
      return res.status(404).json({ error: 'Manager not found' });
    }

    // Check if email is being changed and if new email already exists
    if (email && email.toLowerCase() !== existingManager.email) {
      const emailExists = await ManagerModel.findOne({ 
        email: email.toLowerCase(),
        _id: { $ne: id }
      });
      if (emailExists) {
        return res.status(400).json({ error: 'Manager with this email already exists' });
      }
    }

    // Handle profile photo upload if present
    let profilePhotoUrl = existingManager.profilePhoto;
    if (req.file) {
      try {
        // Delete old image if it exists
        if (existingManager.profilePhoto) {
          const publicId = existingManager.profilePhoto.split('/').pop().split('.')[0];
          await deleteFromCloudinary(`manager-profiles/${publicId}`);
        }
        
        // Upload new image
        const uploadResult = await uploadToCloudinary(req.file.buffer);
        profilePhotoUrl = uploadResult.secure_url;
      } catch (uploadError) {
        console.error('Error uploading image:', uploadError);
        return res.status(500).json({ error: 'Failed to upload profile photo' });
      }
    }

    const updateData = {
      ...(fullName && { fullName }),
      ...(email && { email: email.toLowerCase() }),
      ...(phone !== undefined && { phone }),
      ...(department !== undefined && { department }),
      ...(position !== undefined && { position }),
      ...(bio !== undefined && { bio }),
      profilePhoto: profilePhotoUrl
    };

    const updatedManager = await ManagerModel.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      message: 'Manager updated successfully',
      manager: updatedManager
    });
  } catch (error) {
    console.error('Error updating manager:', error);
    res.status(500).json({ error: error.message });
  }
};

// Delete manager (soft delete)
export const deleteManager = async (req, res) => {
  try {
    const { id } = req.params;
    
    const manager = await ManagerModel.findById(id);
    if (!manager) {
      return res.status(404).json({ error: 'Manager not found' });
    }

    // Delete profile photo from Cloudinary if it exists
    if (manager.profilePhoto) {
      try {
        const publicId = manager.profilePhoto.split('/').pop().split('.')[0];
        await deleteFromCloudinary(`manager-profiles/${publicId}`);
      } catch (deleteError) {
        console.error('Error deleting image from Cloudinary:', deleteError);
        // Continue with manager deletion even if image deletion fails
      }
    }

    // Soft delete by setting isActive to false
    await ManagerModel.findByIdAndUpdate(id, { isActive: false });

    res.status(200).json({
      message: 'Manager deleted successfully',
      deletedManager: {
        id: manager._id,
        fullName: manager.fullName,
        email: manager.email
      }
    });
  } catch (error) {
    console.error('Error deleting manager:', error);
    res.status(500).json({ error: error.message });
  }
};

// Upload profile photo only
export const uploadProfilePhoto = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const manager = await ManagerModel.findById(id);
    if (!manager) {
      return res.status(404).json({ error: 'Manager not found' });
    }

    // Delete old image if it exists
    if (manager.profilePhoto) {
      try {
        const publicId = manager.profilePhoto.split('/').pop().split('.')[0];
        await deleteFromCloudinary(`manager-profiles/${publicId}`);
      } catch (deleteError) {
        console.error('Error deleting old image:', deleteError);
      }
    }

    // Upload new image
    const uploadResult = await uploadToCloudinary(req.file.buffer);
    
    // Update manager with new photo URL
    const updatedManager = await ManagerModel.findByIdAndUpdate(
      id,
      { profilePhoto: uploadResult.secure_url },
      { new: true }
    );

    res.status(200).json({
      message: 'Profile photo uploaded successfully',
      manager: updatedManager
    });
  } catch (error) {
    console.error('Error uploading profile photo:', error);
    res.status(500).json({ error: error.message });
  }
};
