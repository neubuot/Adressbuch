import { ContactList } from '@/components/ContactList'
import { AddContactForm } from '@/components/AddContactForm'

export default function Home() {
  return (
    <div className="container">
      <h1>📇 Adressbuch</h1>
      <div className="card">
        <h2>Neuer Kontakt</h2>
        <AddContactForm />
      </div>
      <div className="card">
        <h2>Alle Kontakte</h2>
        <ContactList />
      </div>
    </div>
  )
}
