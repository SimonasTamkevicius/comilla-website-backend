import express from "express";
import mongoose from "mongoose";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import cors from "cors";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import multer from "multer";
import mailjet from 'node-mailjet';
dotenv.config();

const mailjetClient = mailjet.apiConnect(
  process.env.MJ_APIKEY_PUBLIC,
  process.env.MJ_APIKEY_PRIVATE
);

const saltRounds = 10;

const connectDB = async () => {
    try {
      const conn = await mongoose.connect(process.env.MONGO_URI);
      console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
      console.log(error);
      process.exit(1);
    }
}

const app = express();

app.use(express.json());
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

const corsOptions = {
  origin: ["https://comilla-website.onrender.com"],
  credentials: true,
};

app.use("/uploads", cors(corsOptions), express.static("uploads"));
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use("/uploads", express.static("uploads"));

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  },
});

const upload = multer({
  storage: storage,
}).fields([
  { name: 'image1', maxCount: 1 },
  { name: 'image2', maxCount: 1 },
  { name: 'image3', maxCount: 1 },
  { name: 'image4', maxCount: 1 },
  { name: 'image5', maxCount: 1 },
  { name: 'image6', maxCount: 1 },
]);

const userSchema = {
    email: String,
    password: String
}

const projectSchema = {
    name: String,
    description: String,
    location: String,
    images: [String]
}

const eventSchema = {
  name: String,
  description: String,
  location: String,
  date: String,
  time: String,
  images: [String]
}

const User = mongoose.model("User", userSchema);
const Project = mongoose.model("Project", projectSchema);
const Event = mongoose.model("Event", eventSchema);

app.post("/login", async (req, res) => {
    try {
      const { email, password } = req.body;
  
      const foundUser = await User.findOne({ email: email.toLowerCase() }).exec();

      if (!foundUser) {
        return res.status(400).json({ message: "User not found" });
      } else {
        const result = await bcrypt.compare(password, foundUser.password);
        if (result) {
            const accessToken = jwt.sign(foundUser._id.toJSON(), process.env.ACCESS_TOKEN_SECRET);

            res.cookie("access_token", accessToken, {
              httpOnly: true,
              secure: true,
              maxAge: 10 * 60 * 1000,
            });
    
            res.status(200).json({
              message: "Login successful",
              accessToken: accessToken,
              _id: foundUser._id,
              email: foundUser.email
            });
        } else {
          res.status(400).json({ message: "Incorrect password" });
        }
      }
    } catch (err) {
      console.log(err);
      res.status(500).json({ message: "Internal Server Error" });
    }
});  

app.post("/register", async (req, res) =>{
    try {
        const {email, password} = req.body;

        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const newUser = new User({
            email: email.toLowerCase(),
            password: hashedPassword
        });

        newUser.save()
        res.json({message: "Successfully registered!"})
    }
    catch (err) {
        console.log(err);
    }
})

app.post("/edit-email", async (req, res) => {
  try {
    const { _id, email } = req.body;
    
    const foundUser = await User.findOneAndUpdate(
      { _id: _id },
      { email: email },
    ).exec();

    if (foundUser) {
      res.status(200).json({ message: "Email updated successfully", _id, email });
    } else {
      res.status(404).json({ message: "User not found" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.post("/change-password", async (req, res) => {
  try {
    const { _id, oldPassword, newPassword, confirmNewPassword } = req.body;

    const foundUser = await User.findById({ _id: _id });

    if (foundUser) {
      console.log("found user");
      const result = await bcrypt.compare(oldPassword, foundUser.password);
      if (result) {
        if (newPassword === confirmNewPassword) {
          const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
          await User.findByIdAndUpdate(_id, { password: hashedPassword }).exec();
          res.status(200).json({ message: "Password updated successfully" });
        } else {
          return res.status(404).json({ message: "New passwords do not match" });
        }
      }
      else {
        return res.status(404).json({ message: "Incorrect old password" });
      }
    } else {
      res.status(404).json({ message: "User not found" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal Server Error" });
  }
})

app.get("/project", async (req, res) => {
  try {
      const foundProjects = await Project.find().exec();
      res.json(foundProjects);
  } catch (err) {
      console.log(err);
  }
});

app.post('/project', upload, async (req, res) => {
  try {
    const { name, description, location } = req.body;

    const uploadedImages = {};

    for (let i = 1; i <= 6; i++) {
      const fieldName = `image${i}`;
      if (req.files[fieldName]) {
        uploadedImages[fieldName] = req.files[fieldName][0].filename;
      }
    }

    const foundProject = await Project.findOne({ name }).exec();
    if (foundProject) {
      return res.status(400).json({ message: 'Duplicate Project found.' });
    } else {
      const newProject = new Project({
        name,
        description,
        location,
        images: Object.values(uploadedImages),
      });

      await newProject.save();
      res.json({ message: 'Successfully added project!' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.patch('/project', upload, async (req, res) => {
  try {
    const { _id, name, description, location } = req.body;

    const currentProject = await Project.findById(_id).exec();

    if (!currentProject) {
      return res.status(400).json({ message: 'Project not found.' });
    }

    let updatedImages = [];

    const existingImages = currentProject.images;
    updatedImages = [...existingImages];

    for (let i = 1; i <= 6; i++) {
      const fieldName = `image${i}`;
      if (req.files[fieldName]) {
        updatedImages[i - 1] = req.files[fieldName][0].filename;
      } else if (existingImages.includes(fieldName)) {
        updatedImages[i - 1] = existingImages.find(existingImage => existingImage.startsWith(fieldName));
      }
    }

    const updatedFields = {
      name,
      description,
      location,
      images: Object.values(updatedImages),
    };

    const updatedProject = await Project.findByIdAndUpdate(_id, updatedFields, {
      new: true,
    }).exec();

    if (updatedProject) {
      res.status(200).json({
        message: 'Successfully updated project',
        updatedProject,
      });
    } else {
      res.status(400).json({ message: 'Project not found.' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.delete('/project/:projectId', async (req, res) => {
  try {
    const projectId = req.params.projectId;

    const foundProject = await Project.findOneAndDelete({ _id: projectId }).exec();

    if (foundProject) {
      res.status(200).json({ message: 'Project deleted successfully' });
    } else {
      res.status(404).json({ message: 'Project not found' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.get("/events", async (req, res) => {
  try {
    const events = await Event.find().exec();
    res.json(events);
  } catch (err) {
    console.log(err);
  }
});

app.post('/events', upload, async (req, res) => {
  try {
    const { name, description, location, date, time } = req.body;

    const uploadedImages = {};

    for (let i = 1; i <= 6; i++) {
      const fieldName = `image${i}`;
      if (req.files[fieldName]) {
        uploadedImages[fieldName] = req.files[fieldName][0].filename;
      }
    }

    const foundEvent = await Event.findOne({ name }).exec();

    if (foundEvent) {
      return res.status(400).json({ message: 'Duplicate Event found.' });
    } else {
      const newEvent = new Event({
        name,
        description,
        location,
        date,
        time,
        images: Object.values(uploadedImages),
      });

      await newEvent.save();
      res.json({ message: 'Successfully added event!' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.patch('/events', upload, async (req, res) => {
  try {
    const { _id, name, description, location, date, time } = req.body;

    const currentEvent = await Event.findById(_id).exec();

    if (!currentEvent) {
      return res.status(400).json({ message: 'Event not found.' });
    }

    let updatedImages = [];

    const existingImages = currentEvent.images;
    updatedImages = [...existingImages];

    for (let i = 1; i <= 6; i++) {
      const fieldName = `image${i}`;
      if (req.files[fieldName]) {
        updatedImages[i - 1] = req.files[fieldName][0].filename;
      } else if (existingImages.includes(fieldName)) {
        updatedImages[i - 1] = existingImages.find(existingImage => existingImage.startsWith(fieldName));
      }
    }

    const updatedFields = {
      name,
      description,
      location,
      date,
      time,
      images: Object.values(updatedImages),
    };

    const updatedEvent = await Event.findByIdAndUpdate(_id, updatedFields, {
      new: true,
    }).exec();

    if (updatedEvent) {
      res.status(200).json({
        message: 'Successfully updated event',
        updatedEvent,
      });
    } else {
      res.status(400).json({ message: 'Event not found.' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.delete('/events/:eventId', async (req, res) => {
  try {
    const eventId = req.params.eventId;

    const foundEvent = await Event.findOneAndDelete({ _id: eventId }).exec();

    if (foundEvent) {
      res.status(200).json({ message: 'Event deleted successfully' });
    } else {
      res.status(404).json({ message: 'Event not found' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.post("/contact", async (req, res) => {
  try {
    const formData = req.body;

    const emailData = {
      Messages: [
        {
          From: {
            Email: 'comillaforms@gmail.com',
            Name: 'New Comilla Inc. Form Inquiry',
          },
          To: [
            {
              Email: 'rfq@comillainc.com',
              Name: 'Recipient Name',
            },
          ],
          Subject: 'Comilla Website Form Submission',
          TextPart: 'You received a new form submission:',
          HTMLPart: `<p>Name: ${formData.name}</p>
                    <p>Email: ${formData.email}</p>
                    <p>Subject: ${formData.subject}</p>
                    <p>Message: ${formData.message}</p>`,
        },
      ],
    };

    const request = mailjetClient.post('send', { version: 'v3.1' }).request(emailData);

    request
      .then((result) => {
        res.status(200).json({ message: 'Email sent successfully' });
      })
      .catch((err) => {
        res.status(500).json({ error: 'Email not sent' });
      });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Email not sent' });
  }
});


const PORT = process.env.PORT || 9000;

connectDB().then(() => {
  app.listen(PORT, () => {
      console.log("listening for requests");
  })
})