'use client'

import { useEffect, useState } from 'react'
import { getContacts, deleteContact } from '@/lib/contacts'
import type { Database } from '@/lib/database.types'
import styles from './ContactList.module.css'

type Contact = Database['public']['Tables']['contacts']['Row']

export function ContactList() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    loadContacts()
  }, [])

  async function loadContacts() {
    try {
      setLoading(true)
      const data = await getContacts()
      setContacts(data)
      setError(null)
    } catch (err) {
      setError('Fehler beim Laden der Kontakte')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Möchten Sie diesen Kontakt wirklich löschen?')) {
      return
    }

    try {
      await deleteContact(id)
      setContacts(contacts.filter((c) => c.id !== id))
    } catch (err) {
      alert('Fehler beim Löschen des Kontakts')
      console.error(err)
    }
  }

  const filteredContacts = contacts.filter((contact) => {
    const query = searchQuery.toLowerCase()
    return (
      contact.first_name.toLowerCase().includes(query) ||
      contact.last_name.toLowerCase().includes(query) ||
      contact.email?.toLowerCase().includes(query) ||
      contact.company?.toLowerCase().includes(query)
    )
  })

  if (loading) {
    return <div className={styles.loading}>Lade Kontakte...</div>
  }

  if (error) {
    return <div className={styles.error}>{error}</div>
  }

  return (
    <div className={styles.container}>
      <div className={styles.searchBox}>
        <input
          type="text"
          placeholder="Kontakte durchsuchen..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={styles.searchInput}
        />
      </div>

      {filteredContacts.length === 0 ? (
        <p className={styles.empty}>
          {searchQuery
            ? 'Keine Kontakte gefunden'
            : 'Noch keine Kontakte vorhanden'}
        </p>
      ) : (
        <div className={styles.grid}>
          {filteredContacts.map((contact) => (
            <div key={contact.id} className={styles.contactCard}>
              <div className={styles.contactHeader}>
                <h3>
                  {contact.first_name} {contact.last_name}
                </h3>
                <button
                  onClick={() => handleDelete(contact.id)}
                  className={styles.deleteButton}
                  title="Löschen"
                >
                  ×
                </button>
              </div>

              {contact.company && (
                <p className={styles.company}>{contact.company}</p>
              )}

              {contact.position && (
                <p className={styles.position}>{contact.position}</p>
              )}

              <div className={styles.contactInfo}>
                {contact.email && (
                  <div className={styles.infoRow}>
                    <span className={styles.label}>📧</span>
                    <a href={`mailto:${contact.email}`}>{contact.email}</a>
                  </div>
                )}

                {contact.phone && (
                  <div className={styles.infoRow}>
                    <span className={styles.label}>📞</span>
                    <a href={`tel:${contact.phone}`}>{contact.phone}</a>
                  </div>
                )}

                {contact.mobile && (
                  <div className={styles.infoRow}>
                    <span className={styles.label}>📱</span>
                    <a href={`tel:${contact.mobile}`}>{contact.mobile}</a>
                  </div>
                )}

                {(contact.street || contact.city) && (
                  <div className={styles.infoRow}>
                    <span className={styles.label}>📍</span>
                    <span>
                      {contact.street && <div>{contact.street}</div>}
                      {contact.city && (
                        <div>
                          {contact.postal_code} {contact.city}
                        </div>
                      )}
                      {contact.country && <div>{contact.country}</div>}
                    </span>
                  </div>
                )}

                {contact.notes && (
                  <div className={styles.notes}>
                    <span className={styles.label}>📝</span>
                    <span>{contact.notes}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
