import { useState } from 'react';
import { Mail, Phone, MapPin, MessageCircle, Instagram, Send, Clock } from 'lucide-react';
import contactImage from '../assets/contact.jpg';

export default function Contact() {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        orderId: '',
        message: ''
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const subject = encodeURIComponent('Contact Request - SSC Jewellery');
        const body = encodeURIComponent(
            `Name: ${formData.name}\nEmail: ${formData.email}\nPhone: ${formData.phone}\nOrder ID: ${formData.orderId}\n\nMessage:\n${formData.message}`
        );
        window.location.href = `mailto:support@sscimpon.com?subject=${subject}&body=${body}`;
    };

    return (
        <div className="min-h-screen bg-secondary pb-20">
            {/* Jumbotron */}
            <div className="relative h-64 md:h-80 bg-gray-900 w-full overflow-hidden">
                <div className="absolute inset-0 bg-black/50 z-10"></div>
                <img
                    src={contactImage}
                    alt="Contact"
                    className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="relative z-20 container mx-auto px-4 h-full flex flex-col justify-center items-center text-center">
                    <span className="text-accent uppercase tracking-[0.2em] text-xs md:text-sm font-bold mb-3 animate-fade-in">
                        Get In Touch
                    </span>
                    <h1 className="text-4xl md:text-6xl font-serif text-white mb-4 drop-shadow-lg animate-slide-up">
                        Contact Us
                    </h1>
                </div>
            </div>

            <div className="container mx-auto px-4 py-10">
                <div className="text-center mb-10">
                    <p className="text-xs font-bold uppercase tracking-[0.3em] text-gray-400">Contact</p>
                    <h1 className="text-4xl md:text-5xl font-serif text-primary mt-3">We’re Here to Help</h1>
                    <p className="text-gray-500 mt-3 max-w-2xl mx-auto">
                        Reach out for product inquiries, order support, or custom requests. Our team will respond within 24 hours.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                    <div className="group bg-white rounded-2xl border border-gray-200 p-6 shadow-sm flex items-start gap-4 transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-accent/30">
                        <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center group-hover:text-[#1D4ED8] transition-colors">
                            <Mail size={20} />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-gray-800">Email Us</p>
                            <a href="mailto:support@sscimpon.com" className="text-sm text-gray-500 hover:text-primary">support@sscimpon.com</a>
                        </div>
                    </div>

                    <div className="group bg-white rounded-2xl border border-gray-200 p-6 shadow-sm flex items-start gap-4 transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-accent/30">
                        <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center group-hover:text-[#25D366] transition-colors">
                            <MessageCircle size={20} />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-gray-800">WhatsApp</p>
                            <a href="https://wa.me/919500941350" target="_blank" rel="noreferrer" className="text-sm text-gray-500 hover:text-primary">
                                +91 95009 41350
                            </a>
                        </div>
                    </div>

                    <div className="group bg-white rounded-2xl border border-gray-200 p-6 shadow-sm flex items-start gap-4 transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-accent/30">
                        <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center group-hover:text-[#E1306C] transition-colors">
                            <Instagram size={20} />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-gray-800">Instagram</p>
                            <a href="https://www.instagram.com/sreesaiimpon_jewelery_official" target="_blank" rel="noreferrer" className="text-sm text-gray-500 hover:text-primary">
                                @sreesaiimpon_jewelery_official
                            </a>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-8">
                    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                        <h2 className="text-xl font-serif text-primary mb-4">Send a Message</h2>
                        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <input
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                placeholder="Full Name"
                                className="input-field"
                                required
                            />
                            <input
                                name="email"
                                type="email"
                                value={formData.email}
                                onChange={handleChange}
                                placeholder="Email Address"
                                className="input-field"
                                required
                            />
                            <input
                                name="phone"
                                value={formData.phone}
                                onChange={handleChange}
                                placeholder="Phone Number"
                                className="input-field"
                            />
                            <input
                                name="orderId"
                                value={formData.orderId}
                                onChange={handleChange}
                                placeholder="Order ID (optional)"
                                className="input-field"
                            />
                            <textarea
                                name="message"
                                value={formData.message}
                                onChange={handleChange}
                                placeholder="How can we help you?"
                                className="input-field md:col-span-2 h-32 resize-none"
                                required
                            />
                            <button type="submit" className="btn-primary md:col-span-2 flex items-center justify-center gap-2">
                                <Send size={16} /> Submit
                            </button>
                        </form>
                    </div>

                    <div className="space-y-6">
                        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                            <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-3">Registered Address</h3>
                            <div className="flex items-start gap-3 text-gray-600">
                                <MapPin size={18} className="text-primary mt-1" />
                                <p>12/4, Market Road, Sivakasi, Tamil Nadu, India</p>
                            </div>
                        </div>
                        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                            <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-3">Business Hours</h3>
                            <div className="flex items-start gap-3 text-gray-600">
                                <Clock size={18} className="text-primary mt-1" />
                                <p>Mon – Sat: 10:00 AM – 8:00 PM</p>
                            </div>
                        </div>
                        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                            <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-3">Call Us</h3>
                            <div className="flex items-start gap-3 text-gray-600">
                                <Phone size={18} className="text-primary mt-1" />
                                <a href="tel:+919500941350" className="hover:text-primary">+91 95009 41350</a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
