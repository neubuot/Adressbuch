'use client'

import { useState } from 'react'
import { createContact } from '@/lib/contacts'
import styles from './AddContactForm.module.css'

export function AddContactForm() {
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    mobile: '',
    street: '',
    city: '',
    postal_code: '',
    country: '',
    company: '',
    position: '',
    notes: '',
  })
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setSuccess(false)

    try {
      await createContact(formData)
      setSuccess(true)
      // Reset form
      setFormData({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        mobile: '',
        street: '',
        city: '',
        postal_code: '',
        country: '',
        company: '',
        position: '',
        notes: '',
      })
      // Reload page to show new contact
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    } catch (err) {
      alert('Fehler beim Erstellen des Kontakts')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      {success && (
        <div className={styles.success}>Kontakt erfolgreich erstellt!</div>
      )}

      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor="first_name">Vorname *</label>
          <input
            type="text"
            id="first_name"
            name="first_name"
            value={formData.first_name}
            onChange={handleChange}
            required
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="last_name">Nachname *</label>
          <input
            type="text"
            id="last_name"
            name="last_name"
            value={formData.last_name}
            onChange={handleChange}
            required
          />
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor="email">E-Mail</label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="phone">Telefon</label>
          <input
            type="tel"
            id="phone"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
          />
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor="mobile">Mobil</label>
          <input
            type="tel"
            id="mobile"
            name="mobile"
            value={formData.mobile}
            onChange={handleChange}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="company">Firma</label>
          <input
            type="text"
            id="company"
            name="company"
            value={formData.company}
            onChange={handleChange}
          />
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor="position">Position</label>
        <input
          type="text"
          id="position"
          name="position"
          value={formData.position}
          onChange={handleChange}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="street">Straße</label>
        <input
          type="text"
          id="street"
          name="street"
          value={formData.street}
          onChange={handleChange}
        />
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor="postal_code">PLZ</label>
          <input
            type="text"
            id="postal_code"
            name="postal_code"
            value={formData.postal_code}
            onChange={handleChange}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="city">Stadt</label>
          <input
            type="text"
            id="city"
            name="city"
            value={formData.city}
            onChange={handleChange}
          />
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor="country">Land</label>
        <input
          type="text"
          id="country"
          name="country"
          value={formData.country}
          onChange={handleChange}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="notes">Notizen</label>
        <textarea
          id="notes"
          name="notes"
          value={formData.notes}
          onChange={handleChange}
          rows={3}
        />
      </div>

      <button type="submit" disabled={loading} className={styles.submitButton}>
        {loading ? 'Wird gespeichert...' : 'Kontakt hinzufügen'}
      </button>
    </form>
  )
}
