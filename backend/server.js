const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const rateLimit = require("express-rate-limit");
// Rate limiter for video proxy endpoint (100 requests per 15 min per IP)
const videoProxyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests, please try again later.",
});
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5001;
const HLS_VIDEOS_PATH = path.resolve(
  __dirname,
  process.env.HLS_VIDEOS_PATH || "../hls-videos"
);

// Middleware
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((origin) => origin.trim())
  : ["http://localhost:3000"];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (mobile apps, Postman, etc)
      if (!origin) return callback(null, true);

      if (
        allowedOrigins.indexOf(origin) !== -1 ||
        allowedOrigins.includes("*")
      ) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);
app.use(express.json());

// S3 Client for Tebi.io (signed URLs)
const s3Client = new S3Client({
  region: process.env.TEBI_REGION || "global",
  endpoint: process.env.TEBI_ENDPOINT || "https://s3.tebi.io",
  credentials: {
    accessKeyId: process.env.TEBI_ACCESS_KEY,
    secretAccessKey: process.env.TEBI_SECRET_KEY,
  },
  forcePathStyle: true, // Required for S3-compatible services
});

// Course structure cache
let courseStructureCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Load course structure from JSON file
 */
function loadCourseStructure() {
  const now = Date.now();

  // Return cached version if still valid
  if (
    courseStructureCache &&
    cacheTimestamp &&
    now - cacheTimestamp < CACHE_DURATION
  ) {
    return courseStructureCache;
  }

  // In production, use external storage URLs if available
  const useExternalStorage = process.env.NODE_ENV === "production";
  const tebiStructurePath = path.join(__dirname, "course-structure-tebi.json");
  const archiveStructurePath = path.join(
    __dirname,
    "course-structure-archive.json"
  );
  const blobStructurePath = path.join(__dirname, "course-structure-blob.json");
  const localStructurePath = path.join(
    HLS_VIDEOS_PATH,
    "course-structure.json"
  );

  let jsonPath = localStructurePath;

  // Priority: Tebi.io > Internet Archive > Vercel Blob > Local files
  if (useExternalStorage && fs.existsSync(tebiStructurePath)) {
    jsonPath = tebiStructurePath;
    console.log("🌐 Using Tebi.io S3 storage for videos");
  } else if (useExternalStorage && fs.existsSync(archiveStructurePath)) {
    jsonPath = archiveStructurePath;
    console.log("🗄️  Using Internet Archive storage for videos");
  } else if (useExternalStorage && fs.existsSync(blobStructurePath)) {
    jsonPath = blobStructurePath;
    console.log("📦 Using Vercel Blob storage for videos");
  } else if (fs.existsSync(localStructurePath)) {
    jsonPath = localStructurePath;
    console.log("📁 Using local video files");
  } else {
    console.warn(
      "⚠️  Course structure JSON not found. Please run convert-to-hls.js first."
    );
    return {
      title: "Webflow Masterclass 4.0 PRO",
      sections: [],
    };
  }

  try {
    const data = fs.readFileSync(jsonPath, "utf8");
    courseStructureCache = JSON.parse(data);
    cacheTimestamp = now;
    console.log("✓ Course structure loaded from cache");
    return courseStructureCache;
  } catch (error) {
    console.error("Error loading course structure:", error);
    return {
      title: "Webflow Masterclass 4.0 PRO",
      sections: [],
    };
  }
}

/**
 * Validate license key from licenses data
 */
function validateLicenseKey(licenseKey) {
  if (!licenseKey) return false;

  try {
    let licenses = [];

    // Load licenses from environment variable (production) or file (local)
    if (process.env.LICENSE_DATA) {
      licenses = JSON.parse(process.env.LICENSE_DATA);
    } else {
      const licensesPath = path.join(__dirname, "licenses.json");
      if (fs.existsSync(licensesPath)) {
        licenses = JSON.parse(fs.readFileSync(licensesPath, "utf8"));
      }
    }

    // Find and validate license
    const license = licenses.find(
      (l) => l.key === licenseKey.trim().toUpperCase()
    );

    if (!license) return false;
    if (!license.active) return false;

    // Check if license has expired
    if (license.expiresAt) {
      const expirationDate = new Date(license.expiresAt);
      const now = new Date();
      if (now > expirationDate) {
        return false; // License has expired
      }
    }

    return true;
  } catch (error) {
    console.error("Error validating license:", error);
    return false;
  }
}

/**
 * Generate signed URL for S3 video files
 * URLs expire after 2 hours for security
 */
async function generateSignedUrl(s3Key) {
  try {
    // Extract the path after the bucket name from the full URL
    // Example: https://s3.tebi.io/webflow-masterclass-videos/path/to/file.m3u8
    // We need: path/to/file.m3u8
    const bucketName = process.env.TEBI_BUCKET_NAME;

    // If s3Key is a full URL, extract the path
    let objectKey = s3Key;
    if (s3Key.includes("s3.tebi.io")) {
      const urlParts = s3Key.split(`${bucketName}/`);
      objectKey = urlParts[1] || s3Key;
    }

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
    });

    // Generate signed URL that expires in 2 hours (7200 seconds)
    const signedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 7200,
    });
    return signedUrl;
  } catch (error) {
    console.error("Error generating signed URL:", error);
    return null;
  }
}

/**
 * Middleware to check PRO access
 */
function checkProAccess(req, res, next) {
  // Check for license key in header
  const licenseKey = req.headers["x-license-key"];

  if (licenseKey) {
    // Validate the license key
    req.isProUser = validateLicenseKey(licenseKey);
  } else {
    // Fallback to old method for backwards compatibility
    req.isProUser =
      req.headers["x-pro-user"] === "true" || req.query.isPro === "true";
  }

  next();
}

/**
 * API Routes
 */

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    hlsPath: HLS_VIDEOS_PATH,
  });
});

// Get course structure
app.get("/api/course", checkProAccess, (req, res) => {
  try {
    const courseData = loadCourseStructure();

    // Filter sections based on PRO access
    const filteredSections = courseData.sections.map((section) => {
      if (section.isPro && !req.isProUser) {
        // Return section info but mark lessons as locked
        return {
          ...section,
          lessons: section.lessons.map((lesson) => ({
            ...lesson,
            locked: true,
            hlsPath: null,
          })),
        };
      }
      return section;
    });

    res.json({
      ...courseData,
      sections: filteredSections,
      userAccess: {
        isPro: req.isProUser,
      },
    });
  } catch (error) {
    console.error("Error fetching course:", error);
    res.status(500).json({ error: "Failed to load course structure" });
  }
});

// Get section by ID
app.get("/api/sections/:sectionId", checkProAccess, (req, res) => {
  try {
    const courseData = loadCourseStructure();
    const sectionId = parseInt(req.params.sectionId);
    const section = courseData.sections.find((s) => s.id === sectionId);

    if (!section) {
      return res.status(404).json({ error: "Section not found" });
    }

    // Check PRO access
    if (section.isPro && !req.isProUser) {
      return res.status(403).json({
        error: "PRO access required",
        message: "This section requires PRO membership",
      });
    }

    res.json(section);
  } catch (error) {
    console.error("Error fetching section:", error);
    res.status(500).json({ error: "Failed to load section" });
  }
});

// Get lesson by ID
app.get("/api/lessons/:lessonId", checkProAccess, (req, res) => {
  try {
    const courseData = loadCourseStructure();
    const lessonId = req.params.lessonId;

    // Find lesson across all sections
    let foundLesson = null;
    let parentSection = null;

    for (const section of courseData.sections) {
      const lesson = section.lessons.find((l) => l.id === lessonId);
      if (lesson) {
        foundLesson = lesson;
        parentSection = section;
        break;
      }
    }

    if (!foundLesson) {
      return res.status(404).json({ error: "Lesson not found" });
    }

    // Check PRO access
    if (parentSection.isPro && !req.isProUser) {
      return res.status(403).json({
        error: "PRO access required",
        message: "This lesson requires PRO membership",
        locked: true,
      });
    }

    res.json({
      ...foundLesson,
      section: {
        id: parentSection.id,
        title: parentSection.title,
        isPro: parentSection.isPro,
      },
    });
  } catch (error) {
    console.error("Error fetching lesson:", error);
    res.status(500).json({ error: "Failed to load lesson" });
  }
});

// Update user progress (in production, this would save to database)
app.post("/api/progress", checkProAccess, (req, res) => {
  const { lessonId, progress, completed } = req.body;

  // In production: save to database associated with user ID
  // For now, just acknowledge the request
  console.log(
    `Progress update: Lesson ${lessonId} - ${progress}% - Completed: ${completed}`
  );

  res.json({
    success: true,
    lessonId,
    progress,
    completed,
  });
});

// Validate license key
app.post("/api/validate-license", (req, res) => {
  const { licenseKey } = req.body;

  if (!licenseKey) {
    return res.status(400).json({
      valid: false,
      error: "License key is required",
    });
  }

  try {
    // Try to load from environment variable first (production), then from file (local development)
    let licenses = [];

    if (process.env.LICENSE_DATA) {
      licenses = JSON.parse(process.env.LICENSE_DATA);
    } else {
      const licensesPath = path.join(__dirname, "licenses.json");
      if (!fs.existsSync(licensesPath)) {
        return res.status(400).json({
          valid: false,
          error: "Invalid license key",
        });
      }
      licenses = JSON.parse(fs.readFileSync(licensesPath, "utf8"));
    }
    const license = licenses.find(
      (l) => l.key === licenseKey.trim().toUpperCase()
    );

    if (!license) {
      return res.status(400).json({
        valid: false,
        error: "Invalid license key",
      });
    }

    if (!license.active) {
      return res.status(400).json({
        valid: false,
        error: "This license key has been deactivated",
      });
    }

    // Check if license has expired
    if (license.expiresAt) {
      const expirationDate = new Date(license.expiresAt);
      const now = new Date();
      if (now > expirationDate) {
        return res.status(400).json({
          valid: false,
          error: "This license key has expired",
          expiredAt: license.expiresAt,
        });
      }
    }

    // Mark license as used if first time (only update file in local development)
    if (!license.usedAt) {
      license.usedAt = new Date().toISOString();

      // Only write to file in local development (when using file-based storage)
      if (!process.env.LICENSE_DATA) {
        const licensesPath = path.join(__dirname, "licenses.json");
        fs.writeFileSync(licensesPath, JSON.stringify(licenses, null, 2));
      }
      // In production, the license data is read-only from env variable
    }

    res.json({
      valid: true,
      user: {
        firstName: license.firstName,
        lastName: license.lastName,
      },
      expiresAt: license.expiresAt,
      validityPeriod: license.validityPeriod,
      usedAt: license.usedAt,
    });
  } catch (error) {
    console.error("Error validating license:", error);
    res.status(500).json({
      valid: false,
      error: "Server error validating license",
    });
  }
});

// Proxy endpoint for secure video streaming
app.get(
  "/api/video-proxy/*",
  videoProxyLimiter,
  checkProAccess,
  async (req, res) => {
    try {
      // Extract video path from URL
      const videoPath = req.params[0];

      if (!videoPath) {
        return res.status(400).send("Video path is required");
      }

      // Find which section this video belongs to
      const courseData = loadCourseStructure();
      let videoSection = null;

      for (const section of courseData.sections) {
        for (const lesson of section.lessons) {
          // Check if this video path matches the lesson or any segment
          if (
            lesson.hlsPath &&
            videoPath.includes(lesson.hlsPath.replace("/index.m3u8", ""))
          ) {
            videoSection = section;
            break;
          }
        }
        if (videoSection) break;
      }

      // Check if video requires PRO access
      if (videoSection && videoSection.isPro && !req.isProUser) {
        return res.status(403).send("PRO access required");
      }

      // Use S3 GetObject command to stream the file
      const bucketName = process.env.TEBI_BUCKET_NAME;

      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: videoPath,
      });

      // Get the object from S3
      const s3Response = await s3Client.send(command);

      // Set appropriate headers
      res.setHeader(
        "Content-Type",
        s3Response.ContentType || "application/octet-stream"
      );
      res.setHeader("Content-Length", s3Response.ContentLength);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");

      // Stream the S3 body to the response
      s3Response.Body.pipe(res);
    } catch (error) {
      console.error("Error proxying video:", error);
      if (error.name === "NoSuchKey") {
        return res.status(404).send("Video not found");
      }
      res.status(500).send("Server error streaming video");
    }
  }
);

// Get signed URL for video playback (kept for backward compatibility)
app.post("/api/get-video-url", checkProAccess, async (req, res) => {
  const { videoPath, sectionId } = req.body;

  if (!videoPath) {
    return res.status(400).json({
      error: "Video path is required",
    });
  }

  try {
    const courseData = loadCourseStructure();

    // Find the section containing this video
    let videoSection = null;
    let videoLesson = null;

    for (const section of courseData.sections) {
      for (const lesson of section.lessons) {
        if (lesson.hlsPath === videoPath) {
          videoSection = section;
          videoLesson = lesson;
          break;
        }
      }
      if (videoLesson) break;
    }

    // If section not found and sectionId provided, use that
    if (!videoSection && sectionId !== undefined) {
      videoSection = courseData.sections.find((s) => s.id === sectionId);
    }

    // Check if video requires PRO access
    if (videoSection && videoSection.isPro && !req.isProUser) {
      return res.status(403).json({
        error: "PRO access required",
        message: "This video requires a valid PRO license",
      });
    }

    // Return proxy URL instead of signed URL
    const proxyUrl = `/api/video-proxy/${videoPath}`;

    res.json({
      url: `${process.env.API_URL || "http://localhost:5001"}${proxyUrl}`,
      expiresIn: 0, // Proxy URLs don't expire
    });
  } catch (error) {
    console.error("Error getting video URL:", error);
    res.status(500).json({
      error: "Server error generating video URL",
    });
  }
});

/**
 * Serve HLS .m3u8 playlists with rewritten segment URLs (proxy all segments)
 * Example: /api/hls-playlist/00---introduction/01---course-overview-how-to-make-the-best-of-it---flux-academy/index.m3u8
 */
app.get("/api/hls-playlist/*", checkProAccess, async (req, res) => {
  try {
    const playlistPath = req.params[0];
    if (!playlistPath.endsWith(".m3u8")) {
      return res.status(400).send("Not a playlist");
    }
    const absPath = path.join(HLS_VIDEOS_PATH, playlistPath);
    if (!fs.existsSync(absPath)) {
      return res.status(404).send("Playlist not found");
    }
    let playlist = fs.readFileSync(absPath, "utf8");
    // Rewrite all segment lines to use the proxy endpoint
    playlist = playlist.replace(
      /^(?!#)(.+\.ts)$/gm,
      (match, p1) => `/api/video-proxy/${path.dirname(playlistPath)}/${p1}`
    );
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.send(playlist);
  } catch (err) {
    console.error("Error serving playlist:", err);
    res.status(500).send("Server error serving playlist");
  }
});

/**
 * Static file serving for HLS videos (DISABLED in production for security)
 */
if (process.env.NODE_ENV !== "production") {
  app.use("/videos", express.static(HLS_VIDEOS_PATH));
}

// TODO: Add rate limiting middleware to /api/video-proxy/* endpoint for abuse prevention

/**
 * Error handling
 */
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ error: "Internal server error" });
});

/**
 * Start server
 */
app.listen(PORT, () => {
  console.log("=".repeat(60));
  console.log("🎬 Webflow Course Backend Server");
  console.log("=".repeat(60));
  console.log(`Server running on: http://localhost:${PORT}`);
  console.log(`HLS Videos Path: ${HLS_VIDEOS_PATH}`);
  console.log(
    `CORS Origin: ${process.env.CORS_ORIGIN || "http://localhost:3000"}`
  );
  console.log("=".repeat(60));
  console.log("\nAPI Endpoints:");
  console.log(`  GET  /api/health`);
  console.log(`  GET  /api/course`);
  console.log(`  GET  /api/sections/:sectionId`);
  console.log(`  GET  /api/lessons/:lessonId`);
  console.log(`  POST /api/progress`);
  console.log(`  GET  /videos/...`);
  console.log("=".repeat(60));

  // Load course structure on startup
  loadCourseStructure();
});
